import { loadConfig } from "./config.js";
import { classifyModel } from "./classifier.js";
import { HealthStore } from "./health.js";
import { findCandidates } from "./scorer.js";
import { Router } from "./router.js";
import { AGENT_NAMES, } from "./types.js";
import { Model } from "@opencode-ai/plugin";
import { define } from "@opencode-ai/plugin/promise/plugin";
function modelName(model) {
    return `${model.providerID}/${model.id}`;
}
function log(enabled, ...args) {
    if (enabled)
        console.log("[opencode-agent-router]", ...args);
}
export const OpenCodeAgentRouter = define({
    id: "opencode-agent-router",
    setup: async (ctx) => {
        const config = loadConfig();
        const health = new HealthStore();
        const router = new Router(health);
        let timer;
        let refreshing = false;
        async function discover() {
            const catalog = await ctx.catalog.model.list();
            const models = catalog.data.map(classifyModel);
            return health.merge(models);
        }
        async function applyRouting(reason) {
            if (refreshing)
                return;
            refreshing = true;
            try {
                const models = await discover();
                log(config.log, `discovered ${models.length} models (${reason})`);
                const assignments = new Map();
                const userDefinedAgents = ctx.options["agents"];
                for (const agentName of [
                    ...AGENT_NAMES,
                    ...Object.keys(userDefinedAgents),
                ]) {
                    const candidates = findCandidates(agentName, models, userDefinedAgents).filter(({ model }) => model.health >= config.minHealth);
                    if (candidates.length === 0) {
                        log(config.log, `no suitable model for ${agentName}; leaving unchanged`);
                        continue;
                    }
                    const chosen = router.choose(agentName, candidates, config.strategy);
                    if (!chosen)
                        continue;
                    assignments.set(agentName, Model.Ref.parse(modelName(chosen.model)));
                }
                await ctx.agent.transform((agents) => {
                    for (const [agentName, ref] of assignments) {
                        agents.update(agentName, (agent) => {
                            agent.model = ref;
                        });
                    }
                });
                await ctx.agent.reload();
                for (const [agent, ref] of assignments) {
                    log(config.log, agent, "=>", `${ref.providerID}/${ref.id}`);
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
