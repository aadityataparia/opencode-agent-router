import { loadConfig } from "./config";
import { classifyModel } from "./classifier";
import {
  countMatches,
  findModel,
  formatStatus,
  HELP_TEXT,
  modelRef,
  parseCommand,
  ROUTER_COMMAND,
} from "./commands";
import { HealthStore } from "./health";
import { mapWithConcurrency, probeModel } from "./probe";
import { presetAgentNames } from "./presets";
import { findCandidates } from "./scorer";
import { Router } from "./router";
import { AGENT_NAMES, type AgentName, type DiscoveredModel } from "./types";
import { Model, Plugin, Provider } from "@opencode/plugin";

/**
 * The router exposes one alias model per managed agent (for example,
 * `model-router/orchestrator`) through a virtual provider. Each alias carries
 * a request-body override (`body.model` -> the selected real model), so
 * traffic to the alias is forwarded through OpenCode's compatible endpoint.
 *
 * Agents are never modified: callers can point an agent at
 * `model-router/<agent>` and get automatic, health-aware re-routing.
 */
const ROUTER_PROVIDER = "model-router";
const ROUTER_PROVIDER_NAME = "Model Router";
const ROUTER_PACKAGE = "@opencode/ai/providers/openai-compatible";
const ROUTER_SETTINGS = {
  // The native OpenCode provider uses this endpoint. The public key is the
  // same credential used by the built-in OpenCode inference provider.
  baseURL: "https://opencode.ai/zen/v1",
  apiKey: "public",
} as const;
const OPENCODE_PROVIDER = "opencode";
/** Pings in flight at once; enough to keep a refresh quick, low enough to be polite. */
const PROBE_CONCURRENCY = 6;
/** Re-probe a model only after this many multiples of the refresh interval. */
const PROBE_TTL_REFRESHES = 5;

function log(enabled: boolean, ...args: unknown[]): void {
  // console.error so diagnostics surface in `--print-logs` output.
  if (enabled) console.error("[opencode-agent-router]", ...args);
}

export const OpenCodeAgentRouter = Plugin.define({
  id: "opencode-agent-router",
  setup: async (ctx) => {
    // Resolved before anything else so the preset decision is visible in the
    // log at startup rather than on the first refresh.
    const config = loadConfig(ctx.options);
    const health = new HealthStore();
    const router = new Router(health);

    let timer: ReturnType<typeof setInterval> | undefined;
    let refreshing = false;
    let routerModels: Model.Info[] = [];
    // IDs published by the last successful refresh. Keep this separate from
    // the next inventory so a failed reload can still remove the old aliases.
    let ownedAliasIds = new Set<string>();

    // Snapshot for the `/router` command. Held in setup scope rather than inside
    // a refresh pass so the command can report what is actually published.
    let catalog: DiscoveredModel[] = [];
    let currentAssignments = new Map<AgentName, DiscoveredModel>();
    let lastRun: { at: number; reason: string; probed: number; usable: number } | undefined;
    /** Models left in the pool after probing on the last pass. */
    let lastPoolSize = 0;
    /** Agent -> model ref, forced by `/router pin`. Session-only by design. */
    const pins = new Map<string, string>();

    /**
     * Keep one provider transform registered for the lifetime of the plugin.
     * The transform reads mutable state so periodic refreshes do not stack
     * registrations or retain stale aliases.
     */
    const providerRegistration = await ctx.provider.transform((editor) => {
      const providerID = Provider.ID.make(ROUTER_PROVIDER);
      const existing = editor.get(ROUTER_PROVIDER);

      if (existing) {
        editor.update(ROUTER_PROVIDER, (provider) => {
          provider.name = ROUTER_PROVIDER_NAME;
          provider.package = ROUTER_PACKAGE;
          provider.activation = "enabled";
          provider.settings = { ...ROUTER_SETTINGS };
        });

        // Preserve models owned by other transforms/plugins; replace only the
        // aliases this plugin owns.
        const kept = [...existing.models.values()].filter(
          (model) => !ownedAliasIds.has(model.id),
        );
        editor.models.set(ROUTER_PROVIDER, [...kept, ...routerModels]);
        return;
      }

      editor.add({
        info: {
          ...Provider.Info.empty(providerID),
          name: ROUTER_PROVIDER_NAME,
          package: ROUTER_PACKAGE,
          activation: "enabled",
          settings: { ...ROUTER_SETTINGS },
        },
        models: routerModels,
      });
    });

    async function discover(): Promise<DiscoveredModel[]> {
      const catalog = await ctx.model.list();
      // Exclude our own aliases from the candidate pool so routing never
      // self-references (for example, model-router/orchestrator).
      const models = catalog.data
        .filter(
          (model) =>
            model.providerID !== ROUTER_PROVIDER ||
            !ownedAliasIds.has(model.id),
        )
        .map(classifyModel);
      return health.merge(models);
    }

    /**
     * Providers currently believed to be rejecting credentials, and the notice
     * already shown for them.
     *
     * This is deliberately sticky rather than rebuilt per pass. A model that
     * failed auth goes into cooldown, so on the next refresh it is skipped
     * instead of re-probed; a set recomputed from each pass would empty out and
     * make the notice reappear every cooldown, which is exactly the per-refresh
     * nagging this is meant to prevent. A provider is only cleared once one of
     * its models actually probes `ok` again.
     */
    const authBlocked = new Map<string, number>();
    let lastAuthNotice = "";

    /**
     * Ping every routable model and keep only the ones that answer.
     *
     * A published model is not a working model: the catalog happily lists
     * entries the endpoint will not serve, and routing to one fails on the
     * first real request. Probing first means the candidate pool only contains
     * models that are known to work right now, and the result also feeds
     * health and latency so scoring has something real to rank on.
     *
     * Only `opencode` provider models are probed. Aliases are created for that
     * provider alone, so probing anything else would spend requests on models
     * the router can never select.
     *
     * `force` comes from an explicit `/router refresh`. It bypasses both the
     * probe cache and the cooldown, because the moment a user forces a refresh
     * is usually right after reconnecting a credential — which is exactly when
     * cooldown would keep the broken models from being re-tested and the router
     * would report the same stale answer.
     */
    async function probeCandidates(
      models: DiscoveredModel[],
      force = false,
    ): Promise<{ models: DiscoveredModel[]; probed: number; usable: number }> {
      if (!config.probe) return { models, probed: 0, usable: 0 };

      const routable = models.filter(
        (model) => model.providerID === OPENCODE_PROVIDER,
      );
      const unroutable = models.length - routable.length;
      if (unroutable > 0) {
        log(
          config.log,
          `probe skipped ${unroutable} model(s) on other providers; no alias can target them`,
        );
      }

      const ttlMs = config.refreshMs * PROBE_TTL_REFRESHES;
      const cooldownMs = Math.max(config.probeTimeoutMs * 2, 30_000);
      /** providerID -> models rejected for auth on this pass. */
      const unauthorized = new Map<string, number>();
      /** providerIDs that answered this pass, so a recovered one can be cleared. */
      const answered = new Set<string>();

      const results = await mapWithConcurrency(
        routable,
        PROBE_CONCURRENCY,
        async (model) => {
          const ref = `${model.providerID}/${model.modelID ?? model.id}`;

          // A model that just failed stays out until its cooldown expires, so a
          // dead model costs one probe per cooldown rather than one per refresh.
          if (!force && health.isCoolingDown(model)) {
            log(config.log, `probe ${ref} skipped (cooldown)`);
            return { model, usable: false, probed: false };
          }

          // A cached result is not evidence either way. In particular it must
          // not count as recovery: a model in cooldown was never re-probed, so
          // its provider is still unproven.
          if (!force && !health.needsProbe(model, ttlMs)) {
            return { model, usable: true, probed: false };
          }

          const result = await probeModel(model, {
            baseURL: ROUTER_SETTINGS.baseURL,
            apiKey: ROUTER_SETTINGS.apiKey,
            timeoutMs: config.probeTimeoutMs,
          });

          if (result.verdict !== "inconclusive") {
            health.recordProbe(
              model,
              { ok: result.verdict === "ok", latencyMs: result.latencyMs },
              cooldownMs,
            );
          }

          if (result.verdict === "unauthorized") {
            unauthorized.set(
              model.providerID,
              (unauthorized.get(model.providerID) ?? 0) + 1,
            );
          } else if (result.verdict === "ok") {
            answered.add(model.providerID);
          }

          log(
            config.log,
            result.verdict === "ok"
              ? `probe ${ref} ok in ${result.latencyMs}ms`
              : result.verdict === "inconclusive"
                ? `probe ${ref} inconclusive (${result.status ?? "network"}): ${result.error}`
                : `probe ${ref} ${result.verdict} (${result.status ?? "network"}): ${result.error}`,
          );

          // A rejected credential excludes the model too: whatever the gateway
          // thinks of the model, it cannot serve routed traffic until the
          // provider is reconnected. Only a throttle keeps it in the running.
          return {
            model,
            usable: result.verdict === "ok" || result.verdict === "inconclusive",
            probed: true,
          };
        },
      );

      const usable = results.filter((result) => result.usable);
      const stats = {
        probed: results.filter((result) => result.probed).length,
        usable: usable.length,
      };

      // Fold this pass into the sticky view of who is failing auth, then report
      // only when that view changes, so a credential that stays broken is
      // explained once instead of on every refresh.
      for (const [provider, count] of unauthorized) {
        authBlocked.set(provider, count);
      }
      // A provider is only cleared when it answered *and* nothing on it was
      // rejected. A provider commonly serves both a free model that works and a
      // paid one that needs credentials, and that mix must keep reporting.
      for (const provider of answered) {
        if (!unauthorized.has(provider)) authBlocked.delete(provider);
      }

      const blocked = [...authBlocked.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
      );
      const signature = blocked.map(([provider]) => provider).join(",");
      if (signature !== lastAuthNotice) {
        const recovered = lastAuthNotice
          .split(",")
          .filter((provider) => provider && !authBlocked.has(provider));
        lastAuthNotice = signature;

        if (blocked.length > 0) {
          const detail = blocked
            .map(([provider, count]) => `${count} model(s) on ${provider}`)
            .join("; ");
          console.error(
            `[opencode-agent-router] authentication failed for ${detail}; excluded from routing. Reconnect with \`opencode auth login\`.`,
          );
        } else if (recovered.length > 0) {
          console.error(
            `[opencode-agent-router] authentication is working again for ${recovered.join(", ")}; those models are routable again.`,
          );
        }
      }

      // Every model failing at once means the endpoint, not the catalog, is
      // having a bad moment. Emptying the pool here would delete every alias and
      // break routing, so keep the catalog for this pass and say so loudly.
      if (usable.length === 0 && routable.length > 0) {
        console.error(
          `[opencode-agent-router] probe found no usable models (${routable.length} tried); keeping the catalog for this pass`,
        );
        return { models: routable, probed: stats.probed, usable: routable.length };
      }

      log(
        config.log,
        `probe: ${usable.length}/${routable.length} model(s) usable`,
      );
      return {
        models: usable.map((result) => result.model),
        probed: stats.probed,
        usable: stats.usable,
      };
    }

    /**
     * Agents eligible for routing under the active presets.
     *
     * Shared with `/router` so the status table and the published aliases can
     * never disagree about which agents are in scope.
     */
    function routedAgentNames(): AgentName[] {
      // Only route agents the active presets actually define. Without this the
      // router publishes aliases for every agent it has ever heard of, so a
      // slim-only user also gets sisyphus/metis/prometheus aliases for agents
      // that do not exist in their install.
      const presetAgents = new Set(presetAgentNames(config.presets));
      return [
        ...AGENT_NAMES.filter((name) => presetAgents.has(name)),
        // A user-defined agent is opted into by declaring it, so presets do not
        // gate it.
        ...(Object.keys(config.agents) as AgentName[]),
      ].filter((name, index, all) => all.indexOf(name) === index);
    }

    async function computeAssignments(
      models: DiscoveredModel[],
      fullCatalog: DiscoveredModel[],
    ): Promise<Map<AgentName, DiscoveredModel>> {
      const assignments = new Map<AgentName, DiscoveredModel>();
      const userDefinedAgents = config.agents;
      const presetAgents = new Set(presetAgentNames(config.presets));
      const routedAgents = routedAgentNames();

      const skipped = AGENT_NAMES.filter((name) => !presetAgents.has(name));
      if (skipped.length > 0) {
        log(
          config.log,
          `presets ${config.presets.join(", ") || "(none)"} exclude ${skipped.length} agent(s): ${skipped.join(", ")}`,
        );
      }

      for (const agentName of routedAgents) {
        const candidates = findCandidates(
          agentName,
          models,
          userDefinedAgents,
        ).filter(({ model }) => model.health >= config.minHealth);

        if (candidates.length === 0) {
          log(config.log, `no suitable model for ${agentName}; skipping`);
          continue;
        }

        const chosen = router.choose(agentName, candidates, config.strategy);
        if (chosen) assignments.set(agentName, chosen.model);
      }

      // Pins are the user's explicit instruction, so they are applied after
      // routing and win over it. They resolve against the full catalog rather
      // than the probed pool: a pinned model that is momentarily unhealthy should
      // still be honoured and reported, not silently swapped for something else.
      // A pin also rescues an agent that had no candidate at all.
      const inScope = new Set<string>(routedAgents);
      for (const [agent, ref] of pins) {
        if (!inScope.has(agent)) {
          log(config.log, `pin ignored: ${agent} is not routed under these presets`);
          continue;
        }
        const target = findModel(fullCatalog, ref);
        if (!target) {
          log(config.log, `pin ignored: ${ref} is not in the catalog`);
          continue;
        }
        assignments.set(agent as AgentName, target);
      }

      return assignments;
    }

    function buildAliases(
      assignments: Map<AgentName, DiscoveredModel>,
    ): Model.Info[] {
      const providerID = Provider.ID.make(ROUTER_PROVIDER);
      const aliases: Model.Info[] = [];

      for (const [agentName, target] of assignments) {
        // The router endpoint is OpenCode's endpoint, so only forward model
        // IDs that are valid there.
        if (target.providerID !== OPENCODE_PROVIDER) {
          log(
            config.log,
            `${agentName}: target ${target.providerID}/${target.modelID ?? target.id} is not on the opencode provider; no alias created`,
          );
          continue;
        }

        const targetID = target.modelID ?? target.id;
        aliases.push({
          ...Model.Info.default(providerID, Model.ID.make(agentName)),
          name: `${agentName} (routed)`,
          body: { model: targetID },
        });
      }

      return aliases;
    }

    async function syncRouterModels(
      assignments: Map<AgentName, DiscoveredModel>,
    ): Promise<void> {
      const nextAliases = buildAliases(assignments);
      const nextAliasIds = new Set(nextAliases.map((model) => model.id));

      // Update the state before reload. The single provider transform will be
      // replayed against the new alias inventory. Keep the previous ownership
      // set until the reload succeeds so a failed refresh can still clean up
      // the aliases that were actually published.
      routerModels = nextAliases;
      await ctx.provider.reload();
      ownedAliasIds = nextAliasIds;
    }

    let lastAssignments = "";

    type RefreshOutcome =
      | { status: "changed"; assignments: number }
      | { status: "unchanged"; assignments: number }
      | { status: "busy" }
      | { status: "failed" };

    async function applyRouting(
      reason: string,
      opts: { force?: boolean } = {},
    ): Promise<RefreshOutcome> {
      if (refreshing) return { status: "busy" };
      refreshing = true;

      try {
        const discovered = await discover();
        catalog = discovered;
        log(config.log, `discovered ${discovered.length} models (${reason})`);

        // Probe before scoring so only working models can be selected.
        const probed = await probeCandidates(discovered, opts.force === true);
        const models = probed.models;
        lastPoolSize = models.length;

        const assignments = await computeAssignments(models, discovered);
        currentAssignments = assignments;
        lastRun = {
          at: Date.now(),
          reason,
          probed: probed.probed,
          usable: probed.usable,
        };

        const signature = [...assignments.entries()]
          .map(
            ([agent, model]) =>
              `${agent}=${model.providerID}/${model.modelID ?? model.id}`,
          )
          .join(",");

        if (signature === lastAssignments) {
          log(config.log, "no routing changes; skipping provider refresh");
          return { status: "unchanged", assignments: assignments.size };
        }
        await syncRouterModels(assignments);
        lastAssignments = signature;

        for (const [agent, model] of assignments) {
          log(
            config.log,
            `${agent} => ${ROUTER_PROVIDER}/${agent} -> ${model.providerID}/${model.modelID ?? model.id}`,
          );
        }
        return { status: "changed", assignments: assignments.size };
      } catch (error) {
        console.error("[opencode-agent-router] refresh failed", error);
        return { status: "failed" };
      } finally {
        refreshing = false;
      }
    }

    function renderStatus(): string {
      const now = Date.now();
      return formatStatus({
        config,
        assignments: currentAssignments,
        pins,
        routedAgents: routedAgentNames(),
        discovered: catalog.length,
        routable: lastPoolSize,
        coolingDown: catalog.filter((model) => health.isCoolingDown(model)).length,
        authBlocked: [...authBlocked.entries()].sort(([a], [b]) =>
          a.localeCompare(b),
        ),
        lastRun,
        refreshMs: config.refreshMs,
        now,
      });
    }

    /**
     * `/router` — status, a forced refresh, and session-scoped pins.
     *
     * Replies are posted as synthetic session messages rather than prompts, so
     * they cost no model call and the user sees exactly what the router did
     * instead of a paraphrase of it.
     */
    const commandRegistration = await ctx.command.transform((editor) => {
      editor.add({
        name: ROUTER_COMMAND,
        description:
          "Inspect and steer the model router: status, refresh, pin an agent to a model",
        execute: async ({ sessionID, prompt }) => {
          // A failed reply must not surface as an unhandled rejection inside the
          // host's command dispatch; the router state change already happened.
          const say = async (text: string) => {
            try {
              await ctx.session.synthetic({ sessionID, text });
            } catch (error) {
              console.error(
                "[opencode-agent-router] could not post /router output to the session",
                error,
              );
            }
          };
          const parsed = parseCommand(prompt.text ?? "");

          switch (parsed.kind) {
            case "help":
              await say(HELP_TEXT);
              return;

            case "status":
              await say(renderStatus());
              return;

            case "error":
              await say(parsed.message);
              return;

            case "refresh": {
              // Forced: a user asking to refresh has usually just changed
              // something, and a cached or cooling-down answer would hide it.
              const outcome = await applyRouting("manual", { force: true });
              if (outcome.status === "busy") {
                await say("A refresh is already running; try again in a moment.");
                return;
              }
              if (outcome.status === "failed") {
                await say(
                  "Refresh failed. The published aliases were left untouched; see the log for the error.",
                );
                return;
              }
              const probeNote =
                lastRun && config.probe
                  ? ` ${lastRun.usable}/${lastRun.probed} probed model(s) usable.`
                  : "";
              await say(
                outcome.status === "changed"
                  ? `Re-scanned and re-probed. ${outcome.assignments} agent(s) routed.${probeNote}`
                  : `Re-scanned ${catalog.length} model(s); routing is unchanged.${probeNote}`,
              );
              return;
            }

            case "pin": {
              const agents = routedAgentNames();
              if (!agents.some((name) => name === parsed.agent)) {
                await say(
                  agents.length === 0
                    ? `No agents are in scope, so \`${parsed.agent}\` cannot be pinned. Set \`presets\` in the plugin options first.`
                    : `\`${parsed.agent}\` is not routed under presets ${config.presets.join(", ") || "(none)"}. Routed agents: ${agents.join(", ")}.`,
                );
                return;
              }

              const target = findModel(catalog, parsed.model);
              if (!target) {
                const matches = countMatches(catalog, parsed.model);
                await say(
                  matches > 1
                    ? `\`${parsed.model}\` matches ${matches} models; qualify it as \`provider/model\`.`
                    : `No model matching \`${parsed.model}\` in the ${catalog.length}-model catalog. Run \`/router refresh\` if the catalog is stale.`,
                );
                return;
              }

              // An alias can only forward to the opencode provider. Pinning
              // anything else would silently delete that agent's alias, which
              // looks like the pin "broke" the agent rather than being refused.
              if (target.providerID !== OPENCODE_PROVIDER) {
                await say(
                  `\`${modelRef(target)}\` is on the \`${target.providerID}\` provider, but aliases can only target \`${OPENCODE_PROVIDER}\`. Pin refused.`,
                );
                return;
              }

              pins.set(parsed.agent, modelRef(target));
              const outcome = await applyRouting("pin");
              await say(
                outcome.status === "failed"
                  ? `Pin recorded for ${parsed.agent} -> ${modelRef(target)}, but applying it failed; see the log.`
                  : `Pinned \`${parsed.agent}\` -> \`${modelRef(target)}\` (alias \`${ROUTER_PROVIDER}/${parsed.agent}\`). Session-only; \`/router unpin\` to undo.`,
              );
              return;
            }

            case "unpin": {
              if (!pins.has(parsed.agent)) {
                await say(`\`${parsed.agent}\` is not pinned.`);
                return;
              }
              pins.delete(parsed.agent);
              const outcome = await applyRouting("unpin");
              await say(
                outcome.status === "failed"
                  ? `Removed the pin on \`${parsed.agent}\`, but re-applying routing failed; see the log.`
                  : `Unpinned \`${parsed.agent}\`; it is routed automatically again.`,
              );
              return;
            }

            case "unpin-all": {
              const count = pins.size;
              if (count === 0) {
                await say("No pins are set.");
                return;
              }
              const names = [...pins.keys()].join(", ");
              pins.clear();
              const outcome = await applyRouting("unpin-all");
              await say(
                outcome.status === "failed"
                  ? `Cleared ${count} pin(s) (${names}), but re-applying routing failed; see the log.`
                  : `Cleared ${count} pin(s) (${names}); all agents route automatically again.`,
              );
              return;
            }
          }
        },
      });
    });

    // Make the provider available before the first model discovery pass.
    await ctx.provider.reload();
    await applyRouting("startup");
    await ctx.command.reload();

    timer = setInterval(() => {
      void applyRouting("periodic-refresh");
    }, config.refreshMs);

    // Clear the timer and dispose the transforms when OpenCode unloads or
    // reloads the plugin.
    return async () => {
      if (timer) clearInterval(timer);
      await commandRegistration.dispose();
      await providerRegistration.dispose();
    };
  },
});

export default OpenCodeAgentRouter;
