import { loadConfig } from "./config.js";
import { classifyModel } from "./classifier.js";
import { HealthStore } from "./health.js";
import { mapWithConcurrency, probeModel } from "./probe.js";
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
/** Pings in flight at once; enough to keep a refresh quick, low enough to be polite. */
const PROBE_CONCURRENCY = 6;
/** Re-probe a model only after this many multiples of the refresh interval. */
const PROBE_TTL_REFRESHES = 5;
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
         */
        async function probeCandidates(models) {
            if (!config.probe)
                return models;
            const routable = models.filter((model) => model.providerID === OPENCODE_PROVIDER);
            const unroutable = models.length - routable.length;
            if (unroutable > 0) {
                log(config.log, `probe skipped ${unroutable} model(s) on other providers; no alias can target them`);
            }
            const ttlMs = config.refreshMs * PROBE_TTL_REFRESHES;
            const cooldownMs = Math.max(config.probeTimeoutMs * 2, 30_000);
            const results = await mapWithConcurrency(routable, PROBE_CONCURRENCY, async (model) => {
                const ref = `${model.providerID}/${model.modelID ?? model.id}`;
                // A model that just failed stays out until its cooldown expires, so a
                // dead model costs one probe per cooldown rather than one per refresh.
                if (health.isCoolingDown(model)) {
                    log(config.log, `probe ${ref} skipped (cooldown)`);
                    return { model, usable: false };
                }
                if (!health.needsProbe(model, ttlMs)) {
                    return { model, usable: true };
                }
                const result = await probeModel(model, {
                    baseURL: ROUTER_SETTINGS.baseURL,
                    apiKey: ROUTER_SETTINGS.apiKey,
                    timeoutMs: config.probeTimeoutMs,
                });
                if (result.verdict !== "inconclusive") {
                    health.recordProbe(model, { ok: result.verdict === "ok", latencyMs: result.latencyMs }, cooldownMs);
                }
                log(config.log, result.verdict === "ok"
                    ? `probe ${ref} ok in ${result.latencyMs}ms`
                    : result.verdict === "inconclusive"
                        ? `probe ${ref} inconclusive (${result.status ?? "network"}): ${result.error}`
                        : `probe ${ref} unusable: ${result.error}`);
                // An inconclusive probe still reached the endpoint, so the model stays
                // in the running; only a verdict about the model removes it.
                return { model, usable: result.verdict !== "unusable" };
            });
            const usable = results.filter((result) => result.usable);
            // Every model failing at once means the endpoint, not the catalog, is
            // having a bad moment. Emptying the pool here would delete every alias and
            // break routing, so keep the catalog for this pass and say so loudly.
            if (usable.length === 0 && routable.length > 0) {
                console.error(`[opencode-agent-router] probe found no usable models (${routable.length} tried); keeping the catalog for this pass`);
                return routable;
            }
            log(config.log, `probe: ${usable.length}/${routable.length} model(s) usable`);
            return usable.map((result) => result.model);
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
                const discovered = await discover();
                log(config.log, `discovered ${discovered.length} models (${reason})`);
                // Probe before scoring so only working models can be selected.
                const models = await probeCandidates(discovered);
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
