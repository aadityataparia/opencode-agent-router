import { syncRoutedAgents } from "./agent-files";
import { loadConfig } from "./config";
import { classifyModel } from "./classifier";
import {
  countMatches,
  findModel,
  formatStatus,
  formatUsable,
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
import {
  AGENT_NAMES,
  routerAgentID,
  type AgentName,
  type DiscoveredModel,
} from "./types";
import { Agent, Model, Plugin, Provider } from "@opencode/plugin";

/**
 * One agent per role, `model-router/<agent>`, kept pointed at the winning model.
 * `AgentEditor` has no `add`, and a model on the agent would beat the transform.
 */

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

    // Snapshot for the `/router` command. Held in setup scope rather than inside
    // a refresh pass so the command can report what is actually published.
    let catalog: DiscoveredModel[] = [];
    let currentAssignments = new Map<AgentName, DiscoveredModel>();

    /**
     * The last decided mapping, kept in the plugin's durable store.
     *
     * Two things depend on it. A restart would otherwise publish agents with no
     * model until the first probe pass finished, which is long enough for a
     * dispatch to fail. And it is what a new session reads: the transform runs
     * once per agent load, so without a remembered mapping a session started
     * between two passes would find `model-router/<agent>` unresolved.
     *
     * Held separately from `currentAssignments` so a restored entry never
     * reaches the status table pretending to be a catalog model with real health.
     */
    const STORAGE_KEY = "assignments";
    const assignedRefs = new Map<
      string,
      { providerID: string; modelID: string }
    >();

    async function loadAssignments(): Promise<void> {
      try {
        const raw = await ctx.storage.get(STORAGE_KEY);
        if (!raw || typeof raw !== "object") return;
        for (const [agent, value] of Object.entries(raw)) {
          if (typeof value !== "object" || value === null) continue;
          const ref = value as { providerID?: unknown; modelID?: unknown };
          if (typeof ref.providerID !== "string") continue;
          if (typeof ref.modelID !== "string") continue;
          assignedRefs.set(agent, {
            providerID: ref.providerID,
            modelID: ref.modelID,
          });
        }
        if (assignedRefs.size > 0) {
          log(
            config.log,
            `restored ${assignedRefs.size} assignment(s) from storage`,
          );
        }
      } catch (error) {
        log(config.log, `could not read stored assignments: ${String(error)}`);
      }
    }

    async function saveAssignments(
      assignments: ReadonlyMap<AgentName, DiscoveredModel>,
    ): Promise<void> {
      try {
        const payload: Record<string, { providerID: string; modelID: string }> =
          {};
        for (const [agent, model] of assignments) {
          const modelID = model.modelID ?? model.id;
          payload[agent] = { providerID: model.providerID, modelID };
          assignedRefs.set(agent, { providerID: model.providerID, modelID });
        }
        for (const agent of [...assignedRefs.keys()]) {
          if (!(agent in payload)) assignedRefs.delete(agent);
        }
        await ctx.storage.set(STORAGE_KEY, payload);
      } catch (error) {
        log(config.log, `could not persist assignments: ${String(error)}`);
      }
    }

    let lastRun:
      | { at: number; reason: string; probed: number; usable: number }
      | undefined;
    /** Models left in the pool after probing on the last pass. */
    let lastPoolSize = 0;
    /** Agent -> model ref, forced by `/router pin`. Session-only by design. */
    const pins = new Map<string, string>();

    // One registration for the plugin's lifetime, reading mutable state.
    const agentRegistration = await ctx.agent.transform((editor) => {
      let assigned = 0;
      let preserved = 0;
      const failed: string[] = [];
      // Providers the catalog actually knows. An empty set (before the first
      // discovery pass) makes every bare role look unproven, so it gets written
      // — the same outcome as before this check existed.
      const known = new Set(catalog.map((model) => model.providerID));

      for (const [agentName, ref] of assignedRefs) {
        const model = {
          providerID: Provider.ID.make(ref.providerID),
          id: Model.ID.make(ref.modelID),
        };
        // Both ids get the model. `model-router/<role>` is the router's own
        // agent, but a preset points the bare role at `model-router/<role>` as
        // its *model*, and that model no longer exists — so dispatching the bare
        // role failed with "Model unavailable" without the router ever being
        // consulted. Setting the bare role here is what makes dispatch route.
        for (const id of [routerAgentID(agentName), agentName]) {
          const isOurs = id !== agentName;
          try {
            // `update` is an upsert: the id need not exist yet.
            editor.update(id, (agent) => {
              // A bare role already on a real, known model was set on purpose —
              // a `/router pin`, or a hand-written preset. Leave it alone; the
              // router must not clobber a deliberate choice on every agent load.
              if (!isOurs) {
                const current = agent.model;
                if (current && known.has(String(current.providerID))) {
                  preserved += 1;
                  return;
                }
              }
              agent.id = Agent.ID.make(id);
              agent.name = Agent.Name.make(agentName);
              agent.model = model;
            });
            assigned += 1;
          } catch (error) {
            failed.push(`${id}: ${String(error)}`);
          }
        }
      }
      log(
        config.log,
        `agent transform: ${assigned} applied, ${preserved} kept, for ${assignedRefs.size} role(s)` +
          (failed.length > 0 ? `, failed ${failed.join("; ")}` : ""),
      );
    });

    // Restored first, so the files written below carry the last known model
    // rather than none. A cold `opencode run` reads those files while config
    // loads, before any session exists.
    await loadAssignments();

    // Once, at setup: writing agent files inside the transform would repeat on
    // every reload.
    const agentSync = syncRoutedAgents(
      routedAgentNames(),
      new Map(
        [...assignedRefs].map(([agent, ref]) => [
          agent,
          `${ref.providerID}/${ref.modelID}`,
        ]),
      ),
      (message: string) => log(config.log, message),
    );
    if (agentSync.created.length > 0) {
      log(
        config.log,
        `created ${agentSync.created.length} routed agent(s): ${agentSync.created.join(", ")}`,
      );
      log(config.log, "restart OpenCode to discover the new agent files");
    }
    if (agentSync.removed.length > 0) {
      log(
        config.log,
        `removed agent file(s) for unrouted roles: ${agentSync.removed.join(", ")}`,
      );
    }

    await ctx.agent.reload();

    async function discover(): Promise<DiscoveredModel[]> {
      const catalog = await ctx.model.list();
      // No self-exclusion is needed here: the router publishes no models of its
      // own, so there is no alias for routing to land back on.
      return health.merge(catalog.data.map(classifyModel));
    }

    /** Sticky across passes: a failed model is in cooldown, so a per-pass rebuild would empty it. */
    const authBlocked = new Map<string, number>();
    let lastAuthNotice = "";

    /** Keep only models that answer. `force` skips the probe cache and cooldown, for when a credential was just reconnected. */
    async function probeCandidates(
      models: DiscoveredModel[],
      force = false,
    ): Promise<{ models: DiscoveredModel[]; probed: number; usable: number }> {
      if (!config.probe) return { models, probed: 0, usable: 0 };

      const routable = models;

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

          // One model's failure must not void the batch: `mapWithConcurrency`
          // joins with `Promise.all`.
          try {
            // A model that just failed stays out until its cooldown expires, so a
            // dead model costs one probe per cooldown rather than one per refresh.
            if (!force && health.isCoolingDown(model)) {
              log(config.log, `probe ${ref} skipped (cooldown)`);
              return { model, usable: false, probed: false };
            }

            // A cached result is not recovery: the model was never re-probed.
            if (!force && !health.needsProbe(model, ttlMs)) {
              return { model, usable: true, probed: false };
            }

            const result = await probeModel(model, model.providerID, {
              generate: ctx.generate.text,
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

            // A rejected credential excludes the model; only a throttle keeps it in.
            return {
              model,
              usable:
                result.verdict === "ok" || result.verdict === "inconclusive",
              probed: true,
            };
          } catch (error) {
            // Counted as a probe so the model's health actually moves; a throw
            // that went unrecorded would leave the model looking healthy.
            health.recordProbe(model, { ok: false, latencyMs: 0 }, cooldownMs);
            const detail =
              error instanceof Error ? error.message : String(error);
            log(config.log, `probe ${ref} threw: ${detail}`);
            return { model, usable: false, probed: true };
          }
        },
      );

      const usable = results.filter((result) => result.usable);
      const stats = {
        probed: results.filter((result) => result.probed).length,
        usable: usable.length,
      };

      for (const [provider, count] of unauthorized) {
        authBlocked.set(provider, count);
      }
      // Cleared only once it answered and nothing on it was rejected.
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

      // Everything failing points at the endpoint, not the catalog: keep the
      // catalog for this pass rather than emptying the pool.
      if (usable.length === 0 && routable.length > 0) {
        console.error(
          `[opencode-agent-router] probe found no usable models (${routable.length} tried); keeping the catalog for this pass`,
        );
        return {
          models: routable,
          probed: stats.probed,
          usable: routable.length,
        };
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

    function routedAgentNames(): AgentName[] {
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
          config.minHealth,
        );

        if (candidates.length === 0) {
          log(config.log, `no suitable model for ${agentName}; skipping`);
          continue;
        }

        const chosen = router.choose(agentName, candidates, config.strategy);
        if (chosen) assignments.set(agentName, chosen.model);
      }

      // Pins win over routing and resolve against the full catalog, not the
      // probed pool, so a momentarily unhealthy pinned model is still honoured.
      const inScope = new Set<string>(routedAgents);
      for (const [agent, ref] of pins) {
        if (!inScope.has(agent)) {
          log(
            config.log,
            `pin ignored: ${agent} is not routed under these presets`,
          );
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
        // The agent files carry the model for the next cold start, so they are
        // rewritten whenever routing moves one.
        syncRoutedAgents(
          routedAgentNames(),
          new Map(
            [...assignments].map(([agent, model]) => [
              agent,
              `${model.providerID}/${model.modelID ?? model.id}`,
            ]),
          ),
          (message: string) => log(config.log, message),
        );
        // Persisted before the reload below, so the transform and every session
        // that starts before the next pass see the same mapping.
        await saveAssignments(assignments);
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
        // Reloading replays the transform against this pass's assignments.
        await ctx.agent.reload();
        lastAssignments = signature;

        for (const [agent, model] of assignments) {
          log(
            config.log,
            `${routerAgentID(agent)} -> ${model.providerID}/${model.modelID ?? model.id}`,
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
        coolingDown: catalog.filter((model) => health.isCoolingDown(model))
          .length,
        authBlocked: [...authBlocked.entries()].sort(([a], [b]) =>
          a.localeCompare(b),
        ),
        lastRun,
        refreshMs: config.refreshMs,
        now,
        pool: usablePool(),
      });
    }

    /** The models a routing pass could pick from, best health first. */
    function usablePool(): DiscoveredModel[] {
      return catalog.filter(
        (model) =>
          !health.isCoolingDown(model) && model.health >= config.minHealth,
      );
    }

    function renderUsable(): string {
      return formatUsable({
        config,
        assignments: currentAssignments,
        pins,
        routedAgents: routedAgentNames(),
        discovered: catalog.length,
        routable: lastPoolSize,
        pool: usablePool(),
        coolingDown: catalog.filter((model) => health.isCoolingDown(model))
          .length,
        authBlocked: [...authBlocked.entries()].sort(([a], [b]) =>
          a.localeCompare(b),
        ),
        lastRun,
        refreshMs: config.refreshMs,
        now: Date.now(),
      });
    }

    const execute = async ({
      sessionID,
      prompt,
    }: {
      sessionID: string;
      prompt: { text: string };
    }): Promise<void> => {
      const say = async (text: string) => {
        try {
          await ctx.session.synthetic({
            sessionID,
            text: `Print this message as is:
"""
${text}
"""`,
          });
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

        case "usable":
          await say(renderUsable());
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
          // With probing off a refresh is only a re-scan; do not claim a re-probe.
          const probeNote = config.probe
            ? ` ${lastRun?.usable ?? 0}/${lastRun?.probed ?? 0} probed model(s) usable.`
            : " Probing is off, so this was a catalog re-scan only — set `probe: true` to also re-validate models.";
          await say(
            renderStatus() +
              "\n\n" +
              (outcome.status === "changed"
                ? `Re-scanned${config.probe ? " and re-probed" : ""}. ${outcome.assignments} agent(s) routed.${probeNote}`
                : `Re-scanned ${catalog.length} model(s); routing is unchanged.${probeNote}`),
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

          // No reachability check: a model the router can list, the agent can run.
          pins.set(parsed.agent, modelRef(target));
          const outcome = await applyRouting("pin");
          await say(
            outcome.status === "failed"
              ? `Pin recorded for ${parsed.agent} -> ${modelRef(target)}, but applying it failed; see the log.`
              : `Pinned \`${parsed.agent}\` -> \`${modelRef(target)}\` (agent \`${routerAgentID(parsed.agent)}\`). Session-only; \`/router unpin\` to undo.`,
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
    };

    /** Replies go out as synthetic session messages, so a command costs no model call. */
    const commandRegistration = await ctx.command.transform((editor) => {
      editor.add({
        name: ROUTER_COMMAND,
        description:
          "Inspect and steer the model router: status, refresh, pin an agent to a model",
        execute,
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
      await agentRegistration.dispose();
    };
  },
});

export default OpenCodeAgentRouter;
