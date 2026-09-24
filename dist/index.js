import { loadConfig } from "./config.js";
import { classifyModel } from "./classifier.js";
import { HealthStore } from "./health.js";
import { findCandidates } from "./scorer.js";
import { Router } from "./router.js";
import { AGENT_NAMES, } from "./types.js";
import { Model, Plugin, Provider } from "@opencode/plugin";
/**
 * The router registers a virtual provider ("model-router") that exposes one
 * model per managed agent. Each model aliases to the best real model via a
 * request-body override (`body.model`), so traffic to `model-router/<agent>`
 * is forwarded to OpenCode's zen endpoint with the routed model id.
 *
 * Agents are never modified: whoever owns an agent (another plugin, the user,
 * a preset) can point it at `model-router/<agent>` and get automatic,
 * health-aware re-routing without the agent definition changing.
 */
const ROUTER_PROVIDER = "model-router";
const ROUTER_PACKAGE = "@opencode/ai/providers/openai-compatible";
// Mirrors the runtime "opencode" provider (verified against v2.0.16):
// activation "enabled", apiKey "public", baseURL https://opencode.ai/zen/v1.
const ROUTER_SETTINGS = {
    baseURL: "https://opencode.ai/zen/v1",
    apiKey: "public",
};
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
        async function discover() {
            const catalog = await ctx.model.list();
            const models = catalog.data.map(classifyModel);
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
         * Register (or refresh) the model-router provider: one alias model per
         * assigned agent. Aliases only cover targets on the opencode provider,
         * because the router provider forwards through opencode's zen endpoint.
         */
        async function syncRouterProvider(assignments) {
            const providerID = Provider.ID.make(ROUTER_PROVIDER);
            const models = [];
            for (const [agentName, target] of assignments) {
                if (target.providerID !== OPENCODE_PROVIDER) {
                    log(config.log, `${agentName}: target ${target.providerID}/${target.modelID ?? target.id} is not on the opencode provider; no alias created`);
                    continue;
                }
                const targetID = target.modelID ?? target.id;
                models.push({
                    ...Model.Info.default(providerID, Model.ID.make(agentName)),
                    name: `${agentName} (routed)`,
                    body: { model: targetID },
                });
            }
            await ctx.provider.transform((editor) => {
                if (editor.get(ROUTER_PROVIDER)) {
                    editor.models.set(ROUTER_PROVIDER, models);
                }
                else {
                    editor.add({
                        info: {
                            ...Provider.Info.empty(providerID),
                            name: "Model Router",
                            package: ROUTER_PACKAGE,
                            activation: "enabled",
                            settings: { ...ROUTER_SETTINGS },
                        },
                        models,
                    });
                }
            });
            await ctx.provider.reload();
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
                    log(config.log, "no routing changes; skipping provider refresh");
                    return;
                }
                lastAssignments = signature;
                await syncRouterProvider(assignments);
                for (const [agent, model] of assignments) {
                    log(config.log, `${agent} => model-router/${agent} -> ${model.providerID}/${model.modelID ?? model.id}`);
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
