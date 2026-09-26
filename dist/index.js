import { loadConfig } from "./config.js";
import { classifyModel } from "./classifier.js";
import { HealthStore } from "./health.js";
import { findCandidates } from "./scorer.js";
import { Router } from "./router.js";
import { AGENT_NAMES, } from "./types.js";
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
        let routerModels = [];
        // IDs published by the last successful refresh. Keep this separate from
        // the next inventory so a failed reload can still remove the old aliases.
        let ownedAliasIds = new Set();
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
                const kept = [...existing.models.values()].filter((model) => !ownedAliasIds.has(model.id));
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
        async function discover() {
            const catalog = await ctx.model.list();
            // Exclude our own aliases from the candidate pool so routing never
            // self-references (for example, model-router/orchestrator).
            const models = catalog.data
                .filter((model) => model.providerID !== ROUTER_PROVIDER ||
                !ownedAliasIds.has(model.id))
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
        function buildAliases(assignments) {
            const providerID = Provider.ID.make(ROUTER_PROVIDER);
            const aliases = [];
            for (const [agentName, target] of assignments) {
                // The router endpoint is OpenCode's endpoint, so only forward model
                // IDs that are valid there.
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
            }
            return aliases;
        }
        async function syncRouterModels(assignments) {
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
                await syncRouterModels(assignments);
                lastAssignments = signature;
                for (const [agent, model] of assignments) {
                    log(config.log, `${agent} => ${ROUTER_PROVIDER}/${agent} -> ${model.providerID}/${model.modelID ?? model.id}`);
                }
            }
            catch (error) {
                console.error("[opencode-agent-router] refresh failed", error);
            }
            finally {
                refreshing = false;
            }
        }
        // Make the provider available before the first model discovery pass.
        await ctx.provider.reload();
        await applyRouting("startup");
        timer = setInterval(() => {
            void applyRouting("periodic-refresh");
        }, config.refreshMs);
        // Clear the timer and dispose the provider transform when OpenCode
        // unloads or reloads the plugin.
        return async () => {
            if (timer)
                clearInterval(timer);
            await providerRegistration.dispose();
        };
    },
});
export default OpenCodeAgentRouter;
