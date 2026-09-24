import { loadConfig } from "./config.js";
import { classifyModel } from "./classifier.js";
import { HealthStore } from "./health.js";
import { findCandidates } from "./scorer.js";
import { Router } from "./router.js";
import { AGENT_NAMES, } from "./types.js";
import { Model, Plugin, Provider } from "@opencode/plugin";
/**
 * The router exposes one alias model per managed agent (e.g.
 * "opencode/orchestrator") on the runtime's native `opencode` provider. Each
 * alias carries a request-body override (`body.model` → the routed real
 * model), so traffic to `opencode/<agent>` is forwarded to OpenCode's zen
 * endpoint with the best model for that agent.
 *
 * Why the native `opencode` provider?
 *
 * The model list is gated on *availability*: the runtime only surfaces models
 * from providers with a resolvable connection (native providers, or providers
 * whose credential is present; verified on v2.0.16 — a config `provider` stub
 * or a plugin-registered provider is stored in the registry but never listed).
 * Neither `ctx.provider` nor the client API can create a connection, so a
 * plugin cannot introduce a brand-new provider into the model list. The
 * `opencode` provider is the only listed provider that proxies to the correct
 * endpoint (https://opencode.ai/zen/v1), so alias models attach there.
 *
 * Agents are never modified: whoever owns an agent points it at
 * `opencode/<agent>` and gets automatic, health-aware re-routing.
 */
const OPENCODE_PROVIDER = "opencode";
function log(enabled, ...args) {
    // console.error so diagnostics surface in `--print-logs` output.
    if (enabled)
        console.error("[opencode-agent-router]", ...args);
}
export const OpenCodeAgentRouter = Plugin.define({
    id: "opencode-agent-router",
    setup: async (ctx) => {
        const config = loadConfig();
        const health = new HealthStore();
        const router = new Router(health);
        let timer;
        let refreshing = false;
        /** Ids of alias models this plugin has attached to the opencode provider. */
        const knownAliasIds = new Set();
        async function discover() {
            const catalog = await ctx.model.list();
            // Exclude our own alias models from the candidate pool so routing never
            // self-references (e.g. opencode/orchestrator routing to itself).
            const models = catalog.data
                .filter((m) => m.providerID !== OPENCODE_PROVIDER || !knownAliasIds.has(m.id))
                .map(classifyModel);
            return health.merge(models);
        }
        async function computeAssignments(models) {
            const assignments = new Map();
            const userDefinedAgents = (ctx.options?.["agents"] ??
                {});
            for (const agentName of [
                ...AGENT_NAMES,
                ...Object.keys(userDefinedAgents),
            ]) {
                const candidates = findCandidates(agentName, models, userDefinedAgents).filter(({ model }) => model.health >= config.minHealth);
                if (candidates.length === 0) {
                    log(config.log, `no suitable model for ${agentName}; skipping`);
                    continue;
                }
                const chosen = router.choose(agentName, candidates, config.strategy);
                if (chosen)
                    assignments.set(agentName, chosen.model);
            }
            return assignments;
        }
        /**
         * Attach (or refresh) one alias model per assigned agent on the native
         * `opencode` provider. Aliases only cover targets on that provider,
         * because the aliases forward through opencode's zen endpoint.
         */
        async function syncRouterModels(assignments) {
            const providerID = Provider.ID.make(OPENCODE_PROVIDER);
            const currentAliasIds = new Set();
            const aliases = [];
            for (const [agentName, target] of assignments) {
                if (target.providerID !== OPENCODE_PROVIDER) {
                    log(config.log, `${agentName}: target ${target.providerID}/${target.modelID ?? target.id} is not on the opencode provider; no alias created`);
                    continue;
                }
                const targetID = target.modelID ?? target.id;
                aliases.push({
                    ...Model.Info.default(providerID, Model.ID.make(agentName)),
                    name: `${agentName} (routed)`,
                    body: { model: targetID },
                });
                currentAliasIds.add(agentName);
            }
            await ctx.provider.transform((editor) => {
                const record = editor.get(OPENCODE_PROVIDER);
                if (!record) {
                    log(config.log, "opencode provider not found; skipping alias sync");
                    return;
                }
                // Drop stale aliases from earlier refreshes, keep every other model
                // (native opencode models, other plugins' additions).
                const kept = [...record.models.values()].filter((m) => !knownAliasIds.has(m.id));
                editor.models.set(OPENCODE_PROVIDER, [...kept, ...aliases]);
            });
            await ctx.provider.reload();
            // Only after a successful reload do the new aliases count as known.
            knownAliasIds.clear();
            for (const id of currentAliasIds)
                knownAliasIds.add(id);
        }
        let lastAssignments = "";
        async function applyRouting(reason) {
            if (refreshing)
                return;
            refreshing = true;
            try {
                const models = await discover();
                log(config.log, `discovered ${models.length} models (${reason})`);
                const assignments = await computeAssignments(models);
                const signature = [...assignments.entries()]
                    .map(([agent, model]) => `${agent}=${model.providerID}/${model.modelID ?? model.id}`)
                    .join(",");
                if (signature === lastAssignments) {
                    log(config.log, "no routing changes; skipping alias sync");
                    return;
                }
                lastAssignments = signature;
                await syncRouterModels(assignments);
                for (const [agent, model] of assignments) {
                    log(config.log, `${agent} => opencode/${agent} -> ${model.providerID}/${model.modelID ?? model.id}`);
                }
            }
            catch (error) {
                console.error("[opencode-agent-router] refresh failed", error);
            }
            finally {
                refreshing = false;
            }
        }
        await applyRouting("startup");
        timer = setInterval(() => {
            void applyRouting("periodic-refresh");
        }, config.refreshMs);
        // Clear the timer when OpenCode unloads/reloads the plugin.
        return () => {
            if (timer)
                clearInterval(timer);
        };
    },
});
export default OpenCodeAgentRouter;
