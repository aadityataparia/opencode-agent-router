import { loadConfig } from "./config.js";
import { classifyModel } from "./classifier.js";
import { HealthStore } from "./health.js";
import { findCandidates } from "./scorer.js";
import { Router } from "./router.js";
import {
  AGENT_NAMES,
  AgentRequirements,
  type AgentName,
  type DiscoveredModel,
} from "./types.js";
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
const ROUTER_COMMAND = "routed-models";

function log(enabled: boolean, ...args: unknown[]): void {
  // console.error so diagnostics surface in `--print-logs` output.
  if (enabled) console.error("[opencode-agent-router]", ...args);
}

export const OpenCodeAgentRouter = Plugin.define({
  id: "opencode-agent-router",
  setup: async (ctx) => {
    const config = loadConfig();
    const health = new HealthStore();
    const router = new Router(health);

    let timer: ReturnType<typeof setInterval> | undefined;
    let refreshing = false;
    let routerModels: Model.Info[] = [];
    // IDs published by the last successful refresh. Keep this separate from
    // the next inventory so a failed reload can still remove the old aliases.
    let ownedAliasIds = new Set<string>();
    // Routes currently visible to OpenCode, used by the `/routed-models`
    // command. Only updated after a successful reload so the command can never
    // report an assignment that was never published.
    let publishedRoutes:
      | { entries: { agent: AgentName; target: string }[]; at: number }
      | undefined;

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

    async function computeAssignments(
      models: DiscoveredModel[],
    ): Promise<Map<AgentName, DiscoveredModel>> {
      const assignments = new Map<AgentName, DiscoveredModel>();
      const userDefinedAgents = (ctx.options?.["agents"] ??
        {}) as Record<string, AgentRequirements>;

      for (const agentName of [
        ...AGENT_NAMES,
        ...(Object.keys(userDefinedAgents) as AgentName[]),
      ]) {
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

      return assignments;
    }

    function buildAliases(assignments: Map<AgentName, DiscoveredModel>): {
      aliases: Model.Info[];
      targets: Map<AgentName, string>;
    } {
      const providerID = Provider.ID.make(ROUTER_PROVIDER);
      const aliases: Model.Info[] = [];
      const targets = new Map<AgentName, string>();

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
        targets.set(agentName, `${target.providerID}/${targetID}`);
      }

      return { aliases, targets };
    }

    async function syncRouterModels(
      assignments: Map<AgentName, DiscoveredModel>,
    ): Promise<void> {
      const { aliases, targets } = buildAliases(assignments);
      const nextAliasIds = new Set(aliases.map((model) => model.id));

      // Update the state before reload. The single provider transform will be
      // replayed against the new alias inventory. Keep the previous ownership
      // set until the reload succeeds so a failed refresh can still clean up
      // the aliases that were actually published.
      routerModels = aliases;
      await ctx.provider.reload();
      ownedAliasIds = nextAliasIds;
      publishedRoutes = {
        entries: [...targets].map(([agent, target]) => ({ agent, target })),
        at: Date.now(),
      };
    }

    let lastAssignments = "";

    async function applyRouting(reason: string): Promise<void> {
      if (refreshing) return;
      refreshing = true;

      try {
        const models = await discover();
        log(config.log, `discovered ${models.length} models (${reason})`);

        const assignments = await computeAssignments(models);
        const signature = [...assignments.entries()]
          .map(
            ([agent, model]) =>
              `${agent}=${model.providerID}/${model.modelID ?? model.id}`,
          )
          .join(",");

        if (signature === lastAssignments) {
          log(config.log, "no routing changes; skipping provider refresh");
          return;
        }
        await syncRouterModels(assignments);
        lastAssignments = signature;

        for (const [agent, model] of assignments) {
          log(
            config.log,
            `${agent} => ${ROUTER_PROVIDER}/${agent} -> ${model.providerID}/${model.modelID ?? model.id}`,
          );
        }
      } catch (error) {
        console.error("[opencode-agent-router] refresh failed", error);
      } finally {
        refreshing = false;
      }
    }

    function formatRoutes(): string {
      // OpenCode starts a session turn after every command, so the report
      // closes with an explicit instruction. Without it the agent treats the
      // table as a task and spends a call restating it.
      const noReply = "_Report only. Do not summarize, comment, or ask a question in reply._";

      if (!publishedRoutes || publishedRoutes.entries.length === 0) {
        return `Model Router: no routes published yet. The router is still refreshing, or no candidate passed minHealth ${config.minHealth}.\n\n${noReply}`;
      }

      const { entries, at } = publishedRoutes;
      const width = Math.max(...entries.map((entry) => entry.agent.length));
      const age = Math.max(0, Math.round((Date.now() - at) / 1000));

      return [
        `Model Router (${entries.length} agents, ${config.strategy}, updated ${age}s ago)`,
        ...entries.map(
          (entry) =>
            `  ${entry.agent.padEnd(width)}  model-router/${entry.agent} -> ${entry.target}`,
        ),
        "",
        noReply,
      ].join("\n");
    }

    // Make the provider available before the first model discovery pass.
    await ctx.provider.reload();
    await applyRouting("startup");

    const commandRegistration = await ctx.command.transform((editor) => {
      editor.add({
        name: ROUTER_COMMAND,
        description: "Show the model currently routed to each agent",
        execute: async ({ sessionID, delivery }) => {
          // Nothing published yet: attempt one refresh so the command is useful
          // even when it runs before the first periodic pass completes.
          if (!publishedRoutes) await applyRouting("command");

          // A synthetic message displays the report without invoking a model.
          // Do not interrupt the turn OpenCode starts after a command: doing so
          // strands this message in the inbox instead of displaying it.
          await ctx.session.synthetic({
            sessionID,
            text: formatRoutes(),
            delivery,
          });
        },
      });
    });

    timer = setInterval(() => {
      void applyRouting("periodic-refresh");
    }, config.refreshMs);

    // Clear the timer and dispose the provider and command transforms when
    // OpenCode unloads or reloads the plugin.
    return async () => {
      if (timer) clearInterval(timer);
      await commandRegistration.dispose();
      await providerRegistration.dispose();
    };
  },
});

export default OpenCodeAgentRouter;
