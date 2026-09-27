import { syncRoutedAgents } from "./agent-files";
import { loadConfig } from "./config";
import { classifyModel } from "./classifier";
import { countMatches, findModel, formatStatus, formatUsable, HELP_TEXT, modelRef, parseCommand, ROUTER_COMMAND, } from "./commands";
import { HealthStore } from "./health";
import { mapWithConcurrency, probeModel } from "./probe";
import { presetAgentNames } from "./presets";
import { findCandidates, getAgentRequirements } from "./scorer";
import { Router } from "./router";
import { AGENT_NAMES, routerAgentID, } from "./types";
import { Agent, Model, Plugin, Provider } from "@opencode/plugin";
/**
 * One agent per role, `model-router/<agent>`, kept pointed at the winning model.
 * `AgentEditor` has no `add`, and a model on the agent would beat the transform.
 */
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
        // Resolved before anything else so the preset decision is visible in the
        // log at startup rather than on the first refresh.
        const config = loadConfig(ctx.options);
        const health = new HealthStore();
        const router = new Router(health);
        let timer;
        let refreshing = false;
        // Snapshot for the `/router` command. Held in setup scope rather than inside
        // a refresh pass so the command can report what is actually published.
        let catalog = [];
        let currentAssignments = new Map();
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
        const assignedRefs = new Map();
        async function loadAssignments() {
            try {
                const raw = await ctx.storage.get(STORAGE_KEY);
                if (!raw || typeof raw !== "object")
                    return;
                for (const [agent, value] of Object.entries(raw)) {
                    if (typeof value !== "object" || value === null)
                        continue;
                    const ref = value;
                    if (typeof ref.providerID !== "string")
                        continue;
                    if (typeof ref.modelID !== "string")
                        continue;
                    assignedRefs.set(agent, {
                        providerID: ref.providerID,
                        modelID: ref.modelID,
                    });
                }
                if (assignedRefs.size > 0) {
                    log(config.log, `restored ${assignedRefs.size} assignment(s) from storage`);
                }
            }
            catch (error) {
                log(config.log, `could not read stored assignments: ${String(error)}`);
            }
        }
        async function saveAssignments(assignments) {
            try {
                const payload = {};
                for (const [agent, { model }] of assignments) {
                    const modelID = model.modelID ?? model.id;
                    payload[agent] = { providerID: model.providerID, modelID };
                    assignedRefs.set(agent, { providerID: model.providerID, modelID });
                }
                for (const agent of [...assignedRefs.keys()]) {
                    if (!(agent in payload))
                        assignedRefs.delete(agent);
                }
                await ctx.storage.set(STORAGE_KEY, payload);
            }
            catch (error) {
                log(config.log, `could not persist assignments: ${String(error)}`);
            }
        }
        let lastRun;
        /** Models left in the pool after probing on the last pass. */
        let lastPoolSize = 0;
        /** Agent -> model ref, forced by `/router pin`. Session-only by design. */
        const pins = new Map();
        // One registration for the plugin's lifetime, reading mutable state.
        const agentRegistration = await ctx.agent.transform((editor) => {
            let assigned = 0;
            let preserved = 0;
            const failed = [];
            for (const [agentName, ref] of assignedRefs) {
                const model = {
                    providerID: Provider.ID.make(ref.providerID),
                    id: Model.ID.make(ref.modelID),
                };
                for (const id of [routerAgentID(agentName), agentName]) {
                    try {
                        editor.update(id, (agent) => {
                            agent.id = Agent.ID.make(id);
                            agent.name = Agent.Name.make(agentName);
                            agent.model = model;
                        });
                        assigned += 1;
                    }
                    catch (error) {
                        failed.push(`${id}: ${String(error)}`);
                    }
                }
            }
            log(config.log, `agent transform: ${assigned} applied, ${preserved} kept, for ${assignedRefs.size} role(s)` +
                (failed.length > 0 ? `, failed ${failed.join("; ")}` : ""));
        });
        // Restored first, so the files written below carry the last known model
        // rather than none. A cold `opencode run` reads those files while config
        // loads, before any session exists.
        await loadAssignments();
        // Once, at setup: writing agent files inside the transform would repeat on
        // every reload.
        const agentSync = syncRoutedAgents(routedAgentNames(), new Map([...assignedRefs].map(([agent, ref]) => [
            agent,
            `${ref.providerID}/${ref.modelID}`,
        ])), (message) => log(config.log, message));
        if (agentSync.created.length > 0) {
            log(config.log, `created ${agentSync.created.length} routed agent(s): ${agentSync.created.join(", ")}`);
            log(config.log, "restart OpenCode to discover the new agent files");
        }
        if (agentSync.removed.length > 0) {
            log(config.log, `removed agent file(s) for unrouted roles: ${agentSync.removed.join(", ")}`);
        }
        await ctx.agent.reload();
        async function discover() {
            const catalog = await ctx.model.list();
            // No self-exclusion is needed here: the router publishes no models of its
            // own, so there is no alias for routing to land back on.
            return health.merge(catalog.data.map(classifyModel));
        }
        /** Sticky across passes: a failed model is in cooldown, so a per-pass rebuild would empty it. */
        const authBlocked = new Map();
        let lastAuthNotice = "";
        /** Keep only models that answer. `force` skips the probe cache and cooldown, for when a credential was just reconnected. */
        async function probeCandidates(models, force = false) {
            if (!config.probe)
                return { models, probed: 0, usable: 0 };
            const routable = models;
            const ttlMs = config.refreshMs * PROBE_TTL_REFRESHES;
            const cooldownMs = Math.max(config.probeTimeoutMs * 2, 30_000);
            /** providerID -> models rejected for auth on this pass. */
            const unauthorized = new Map();
            /** providerIDs that answered this pass, so a recovered one can be cleared. */
            const answered = new Set();
            const results = await mapWithConcurrency(routable, PROBE_CONCURRENCY, async (model) => {
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
                    // A cached result is not recovery: the model was never re-probed. A
                    // cached *failure* must not read as usable either — that let every
                    // model which had failed stay in the pool for the whole TTL, long
                    // past its cooldown.
                    if (!force && !health.needsProbe(model, ttlMs)) {
                        return { model, usable: model.successes > 0, probed: false };
                    }
                    const result = await probeModel(model, model.providerID, {
                        generate: ctx.generate.text,
                        timeoutMs: config.probeTimeoutMs,
                    });
                    if (result.verdict !== "inconclusive") {
                        health.recordProbe(model, { ok: result.verdict === "ok", latencyMs: result.latencyMs }, cooldownMs);
                    }
                    if (result.verdict === "unauthorized") {
                        unauthorized.set(model.providerID, (unauthorized.get(model.providerID) ?? 0) + 1);
                    }
                    else if (result.verdict === "ok") {
                        answered.add(model.providerID);
                    }
                    log(config.log, result.verdict === "ok"
                        ? `probe ${ref} ok in ${result.latencyMs}ms`
                        : result.verdict === "inconclusive"
                            ? `probe ${ref} inconclusive (${result.status ?? "network"}): ${result.error}`
                            : `probe ${ref} ${result.verdict} (${result.status ?? "network"}): ${result.error}`);
                    // A rejected credential excludes the model; only a throttle keeps it in.
                    return {
                        model,
                        usable: result.verdict === "ok" || result.verdict === "inconclusive",
                        probed: true,
                    };
                }
                catch (error) {
                    // Counted as a probe so the model's health actually moves; a throw
                    // that went unrecorded would leave the model looking healthy.
                    health.recordProbe(model, { ok: false, latencyMs: 0 }, cooldownMs);
                    const detail = error instanceof Error ? error.message : String(error);
                    log(config.log, `probe ${ref} threw: ${detail}`);
                    return { model, usable: false, probed: true };
                }
            });
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
                if (!unauthorized.has(provider))
                    authBlocked.delete(provider);
            }
            const blocked = [...authBlocked.entries()].sort(([a], [b]) => a.localeCompare(b));
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
                    console.error(`[opencode-agent-router] authentication failed for ${detail}; excluded from routing. Reconnect with \`opencode auth login\`.`);
                }
                else if (recovered.length > 0) {
                    console.error(`[opencode-agent-router] authentication is working again for ${recovered.join(", ")}; those models are routable again.`);
                }
            }
            // Everything failing points at the endpoint, not the catalog: keep the
            // catalog for this pass rather than emptying the pool.
            if (usable.length === 0 && routable.length > 0) {
                console.error(`[opencode-agent-router] probe found no usable models (${routable.length} tried); keeping the catalog for this pass`);
                return {
                    models: routable,
                    probed: stats.probed,
                    usable: routable.length,
                };
            }
            log(config.log, `probe: ${usable.length}/${routable.length} model(s) usable`);
            return {
                models: usable.map((result) => result.model),
                probed: stats.probed,
                usable: stats.usable,
            };
        }
        function routedAgentNames() {
            const presetAgents = new Set(presetAgentNames(config.presets));
            return [
                ...AGENT_NAMES.filter((name) => presetAgents.has(name)),
                // A user-defined agent is opted into by declaring it, so presets do not
                // gate it.
                ...Object.keys(config.agents),
            ].filter((name, index, all) => all.indexOf(name) === index);
        }
        async function computeAssignments(models, fullCatalog) {
            const assignments = new Map();
            const userDefinedAgents = config.agents;
            const presetAgents = new Set(presetAgentNames(config.presets));
            const routedAgents = routedAgentNames();
            const skipped = AGENT_NAMES.filter((name) => !presetAgents.has(name));
            if (skipped.length > 0) {
                log(config.log, `presets ${config.presets.join(", ") || "(none)"} exclude ${skipped.length} agent(s): ${skipped.join(", ")}`);
            }
            for (const agentName of routedAgents) {
                const candidates = findCandidates(agentName, models, userDefinedAgents, config.minHealth);
                if (candidates.length === 0) {
                    log(config.log, `no suitable model for ${agentName}; skipping`);
                    continue;
                }
                const chosen = router.choose(agentName, candidates, config.strategy);
                if (chosen)
                    assignments.set(agentName, chosen);
            }
            // Pins win over routing and resolve against the full catalog, not the
            // probed pool, so a momentarily unhealthy pinned model is still honoured.
            const inScope = new Set(routedAgents);
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
                assignments.set(agent, {
                    model: target,
                    score: 0,
                    breakdown: {
                        category: 0,
                        health: 0,
                        latency: 0,
                        cost: 0,
                        context: 0,
                        capabilities: 0,
                    },
                });
            }
            return assignments;
        }
        let lastAssignments = "";
        async function applyRouting(reason, opts = {}) {
            if (refreshing)
                return { status: "busy" };
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
                syncRoutedAgents(routedAgentNames(), new Map([...assignments].map(([agent, { model }]) => [
                    agent,
                    `${model.providerID}/${model.modelID ?? model.id}`,
                ])), (message) => log(config.log, message));
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
                    .map(([agent, { model }]) => `${agent}=${model.providerID}/${model.modelID ?? model.id}`)
                    .join(",");
                if (signature === lastAssignments) {
                    log(config.log, "no routing changes; skipping provider refresh");
                    return { status: "unchanged", assignments: assignments.size };
                }
                // Reloading replays the transform against this pass's assignments.
                await ctx.agent.reload();
                lastAssignments = signature;
                // `unpin-all` belongs here as much as `unpin`: both clear a pin, and
                // whichever one held this session must hand the model back.
                if (opts.session &&
                    ["pin", "unpin", "unpin-all", "manual"].includes(reason)) {
                    const curAgent = opts.session.agent?.replace("model-router/", "");
                    const selectedModel = curAgent
                        ? currentAssignments.get(curAgent)
                        : undefined;
                    if (selectedModel &&
                        (opts.session.model?.providerID !==
                            selectedModel.model.providerID ||
                            opts.session.model?.id !== selectedModel.model.id)) {
                        await ctx.session.switchModel({
                            sessionID: opts.session.id,
                            model: {
                                id: selectedModel.model.id,
                                providerID: selectedModel.model.providerID,
                            },
                        });
                    }
                }
                return { status: "changed", assignments: assignments.size };
            }
            catch (error) {
                console.error("[opencode-agent-router] refresh failed", error);
                return { status: "failed" };
            }
            finally {
                refreshing = false;
            }
        }
        function renderStatus(agent) {
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
                authBlocked: [...authBlocked.entries()].sort(([a], [b]) => a.localeCompare(b)),
                lastRun,
                refreshMs: config.refreshMs,
                now,
                pool: usablePool(),
                currentAgentReq: getAgentRequirements(agent, config.agents),
                currentAgent: agent,
            });
        }
        /** The models a routing pass could pick from, best health first. */
        function usablePool() {
            return catalog.filter((model) => model.successes > 0 &&
                !health.isCoolingDown(model) &&
                model.health >= config.minHealth);
        }
        function renderUsable(agent) {
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
                authBlocked: [...authBlocked.entries()].sort(([a], [b]) => a.localeCompare(b)),
                lastRun,
                refreshMs: config.refreshMs,
                now: Date.now(),
                currentAgentReq: getAgentRequirements(agent, config.agents),
                currentAgent: agent,
            });
        }
        const execute = async ({ sessionID, prompt, }) => {
            const curSession = await ctx.session.get({
                sessionID,
            });
            const say = async (text) => {
                try {
                    await ctx.session.synthetic({
                        sessionID,
                        text: `Print this message as is:
"""
${text}
"""`,
                    });
                }
                catch (error) {
                    console.error("[opencode-agent-router] could not post /router output to the session", error);
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
                    await say(renderUsable(curSession.agent?.replace("model-router/", "")));
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
                        await say("Refresh failed. The published aliases were left untouched; see the log for the error.");
                        return;
                    }
                    // With probing off a refresh is only a re-scan; do not claim a re-probe.
                    const probeNote = config.probe
                        ? ` ${lastRun?.usable ?? 0}/${lastRun?.probed ?? 0} probed model(s) usable.`
                        : " Probing is off, so this was a catalog re-scan only — set `probe: true` to also re-validate models.";
                    await say(renderStatus() +
                        "\n\n" +
                        (outcome.status === "changed"
                            ? `Re-scanned${config.probe ? " and re-probed" : ""}. ${outcome.assignments} agent(s) routed.${probeNote}`
                            : `Re-scanned ${catalog.length} model(s); routing is unchanged.${probeNote}`));
                    return;
                }
                case "pin": {
                    const agents = routedAgentNames();
                    if (!agents.includes(parsed.agent)) {
                        await say(agents.length === 0
                            ? `No agents are in scope, so \`${parsed.agent}\` cannot be pinned. Set \`presets\` in the plugin options first.`
                            : `\`${parsed.agent}\` is not routed under presets ${config.presets.join(", ") || "(none)"}. Routed agents: ${agents.join(", ")}.`);
                        return;
                    }
                    const target = findModel(catalog, parsed.model);
                    if (!target) {
                        const matches = countMatches(catalog, parsed.model);
                        await say(matches > 1
                            ? `\`${parsed.model}\` matches ${matches} models; qualify it as \`provider/model\`.`
                            : `No model matching \`${parsed.model}\` in the ${catalog.length}-model catalog. Run \`/router refresh\` if the catalog is stale.`);
                        return;
                    }
                    // No reachability check: a model the router can list, the agent can run.
                    pins.set(parsed.agent, modelRef(target));
                    const outcome = await applyRouting("pin", {
                        session: curSession,
                    });
                    await say(outcome.status === "failed"
                        ? `Pin recorded for ${parsed.agent} -> ${modelRef(target)}, but applying it failed; see the log.`
                        : `Pinned \`${parsed.agent}\` -> \`${modelRef(target)}\`. Session-only; run \`/router unpin\` to undo. ${curSession.agent === parsed.agent ? `Current agent has changed, changed model to pinned model: ${target.providerID}/${target.modelID}` : ""}`);
                    return;
                }
                case "unpin": {
                    if (!pins.has(parsed.agent)) {
                        await say(`\`${parsed.agent}\` is not pinned.`);
                        return;
                    }
                    pins.delete(parsed.agent);
                    const outcome = await applyRouting("unpin", {
                        session: curSession,
                    });
                    await say(outcome.status === "failed"
                        ? `Removed the pin on \`${parsed.agent}\`, but re-applying routing failed; see the log.`
                        : `Unpinned \`${parsed.agent}\`; it is routed automatically again.`);
                    return;
                }
                case "unpin-all": {
                    const count = pins.size;
                    if (count === 0) {
                        await say("No pins are set.");
                        return;
                    }
                    const names = [...pins.keys()].join(", ");
                    const cleared = new Set(pins.keys());
                    pins.clear();
                    // Only hand the session back when the pin that was holding it is one
                    // of the cleared ones: clearing a different agent's pin says nothing
                    // about which model this session should run on, and forcing one would
                    // overwrite a model the user chose by hand.
                    const curAgent = curSession.agent?.replace("model-router/", "");
                    const outcome = await applyRouting("unpin-all", {
                        session: curAgent && cleared.has(curAgent) ? curSession : undefined,
                    });
                    await say(outcome.status === "failed"
                        ? `Cleared ${count} pin(s) (${names}), but re-applying routing failed; see the log.`
                        : `Cleared ${count} pin(s) (${names}); all agents route automatically again.`);
                    return;
                }
            }
        };
        /** Replies go out as synthetic session messages, so a command costs no model call. */
        const commandRegistration = await ctx.command.transform((editor) => {
            editor.add({
                name: ROUTER_COMMAND,
                description: "Inspect and steer the model router: status, refresh, pin an agent to a model",
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
            if (timer)
                clearInterval(timer);
            await commandRegistration.dispose();
            await agentRegistration.dispose();
        };
    },
});
export default OpenCodeAgentRouter;
