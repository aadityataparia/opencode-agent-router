import { STRATEGY_NAMES } from "./types";
/**
 * Pure parsing and rendering for `/router`: the handler in `index.ts` owns the
 * state and the side effects. Output goes out as a synthetic session message, so
 * a command costs no model call and cannot be paraphrased.
 */
export const ROUTER_COMMAND = "router";
/** Split on whitespace. Model IDs never contain spaces, so quoting buys nothing. */
function tokenize(text) {
    return text
        .replace("/router", "")
        .trim()
        .split(/\s+/)
        .filter((token) => token.length > 0);
}
export function parseCommand(text) {
    const tokens = tokenize(text);
    // A bare `/router` is the common case, and status is what a user asking
    // "what is this thing doing right now" wants.
    if (tokens.length === 0)
        return { kind: "status" };
    const [action, ...rest] = tokens;
    const verb = action.toLowerCase();
    if (verb === "status" || verb === "show" || verb === "list") {
        return rest.length === 0
            ? { kind: "status" }
            : { kind: "error", message: `\`status\` takes no arguments.` };
    }
    if (verb === "refresh" || verb === "reload" || verb === "rescan") {
        return rest.length === 0
            ? { kind: "refresh" }
            : { kind: "refresh", agents: rest };
    }
    if (verb === "strategy" || verb === "presets") {
        const valid = STRATEGY_NAMES.join(", ");
        if (rest.length === 0) {
            return {
                kind: "error",
                message: `\`strategy\` takes one strategy: \`/router strategy latency\`. Valid: ${valid}.`,
            };
        }
        if (rest.length > 1) {
            return {
                kind: "error",
                message: `\`strategy\` takes exactly one strategy; got ${rest.length} arguments.`,
            };
        }
        const wanted = rest[0].trim().toLowerCase();
        if (!STRATEGY_NAMES.includes(wanted)) {
            return {
                kind: "error",
                message: `Unknown strategy \`${rest[0]}\`. Valid: ${valid}.`,
            };
        }
        return { kind: "strategy", strategy: wanted };
    }
    if (verb === "help" || verb === "?")
        return { kind: "help" };
    if (verb === "unpin" || verb === "reset") {
        if (rest.length === 0)
            return { kind: "unpin-all" };
        if (rest.length > 1) {
            return {
                kind: "error",
                message: `\`unpin\` takes one agent. Use \`/router unpin\` to clear every pin.`,
            };
        }
        return { kind: "unpin", agent: rest[0] };
    }
    if (verb === "usable" || verb === "models" || verb === "pool") {
        return { kind: "usable", filter: rest.join(" ") };
    }
    if (verb === "debug") {
        if (rest.length === 0) {
            return {
                kind: "error",
                message: "`debug` takes a model reference: `/router debug provider/model-id`",
            };
        }
        return { kind: "debug", modelRef: rest.join(" ") };
    }
    if (verb === "probe" || verb === "ping") {
        if (rest.length === 0) {
            return {
                kind: "error",
                message: `\`${verb}\` takes a model reference: \`/router probe provider/model-id\``,
            };
        }
        return { kind: "probe", modelRef: rest.join(" ") };
    }
    if (verb === "pin") {
        if (rest[0] === "--clear" || rest[0] === "clear")
            return { kind: "unpin-all" };
        if (rest.length < 2) {
            return {
                kind: "error",
                message: `\`pin\` needs an agent and a model: \`/router pin ${"explorer"} ${"opencode/model-id"}\`. Use \`/router unpin\` to clear every pin.`,
            };
        }
        if (rest.length > 2) {
            return {
                kind: "error",
                message: `\`pin\` takes exactly one agent and one model; got ${rest.length} arguments.`,
            };
        }
        return { kind: "pin", agent: rest[0], model: rest[1] };
    }
    return {
        kind: "error",
        message: `Unknown action \`${action}\`. Run \`/router help\` for the list.`,
    };
}
function normalize(value) {
    return value.trim().toLowerCase();
}
function formatDuration(ms) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 60)
        return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return `${minutes}m ${seconds % 60}s`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
function healthCell(model, now) {
    if (model.cooldownUntil && model.cooldownUntil > now) {
        return `${model.health.toFixed(2)} (cooling) (${model.successes} ok / ${model.failures} failed)`;
    }
    return (model.health.toFixed(2) +
        ` (${model.successes} ok / ${model.failures} failed)`);
}
export function tableRow(...cells) {
    return `| ${cells.join(" | ")} |`;
}
export function table(header, rows) {
    const lines = [];
    lines.push(tableRow(...header), tableRow(...header.map(() => "---")));
    for (const row of rows) {
        lines.push(tableRow(...row));
    }
    return lines.join("\n");
}
export function formatStatus(config, store, router) {
    const lines = [];
    lines.push(`**model-router** · ${config.current.strategy} · presets: ${config.current.presets.join(", ") || "none detected"}`, "");
    const routed = Array.from(router.cachedAssignments.keys());
    if (routed.length === 0) {
        lines.push("No agents are in scope. Set `presets` in the plugin options, or declare an `agents` entry.");
    }
    else {
        lines.push(table(["agent", "model", "health", "latency", "note"], []));
        for (const agent of routed) {
            const model = router.cachedAssignments.get(agent);
            const pin = router.pins.get(agent);
            if (!model) {
                const note = pin ? "pinned model unavailable" : "no candidate";
                lines.push(`| \`${agent}\` | — | — | — | ${note} |`);
                continue;
            }
            const notes = [];
            if (pin) {
                notes.push(normalize(model.target) === normalize(pin)
                    ? "pinned"
                    : `pin \`${pin}\` unavailable, routed instead`);
            }
            const modelData = store.getModel(model.target);
            if (!modelData) {
                notes.push("model not in store");
            }
            lines.push(`| \`${agent}\` | \`${model.target}\` | ${healthCell(modelData, Date.now())} | ${Number.isFinite(modelData?.latencyMs) ? `${modelData?.latencyMs.toFixed(0)}ms` : "—"} | ${notes.join("; ") || "—"} |`);
        }
    }
    return lines.join("\n");
}
/** The pool a routing pass can choose from, for `/router usable`. */
export function formatUsable(config, store, router, agent) {
    if (!agent) {
        return `No agent specified. Run \`/router usable <agent>\` to see the pool for one agent.`;
    }
    const lines = [];
    const pool = router.getCandidates(agent) || [];
    if (pool.length === 0) {
        return [
            "No models are routable right now.",
            "",
            "Every discovered model is either unusable or in cooldown. Run",
            "`/router refresh` to re-probe, and check the status for an auth block.",
        ].join("\n");
    }
    lines.push(`**${pool.length} model(s) routable** · ${pool.length} usable for ${agent} · ${store.getAllModels().length} discovered`, "", `| model | health | score (for ${agent}) | latency |`, "| --- | --- | --- | --- |");
    for (const model of pool) {
        const modelData = store.getModel(model.target);
        if (!modelData) {
            lines.push(`| \`${model.target}\` | — | — | — | model not in store |`);
            continue;
        }
        const latency = Number.isFinite(modelData.latencyMs) && modelData.latencyMs > 0
            ? `${modelData.latencyMs.toFixed(0)}ms`
            : "—";
        const seen = modelData.lastProbeAt === undefined
            ? ""
            : ` · ${modelData.successes} ok / ${modelData.failures} failed`;
        lines.push(`| \`${model.target}\` | ${healthCell(modelData, Date.now())}${seen} | ${model.score.toFixed(2)} | ${latency} |`);
    }
    return lines.join("\n");
}
export const HELP_TEXT = [
    "**/router** — inspect and steer the model router",
    "",
    "| command | effect |",
    "| --- | --- |",
    "| `/router` | show routing status |",
    "| `/router usable <agent?>` | list every model the router can currently pick |",
    "| `/router refresh` | re-scan providers and re-route now, ignoring probe cache and cooldown |",
    "| `/router strategy <name>` | switch routing strategy and re-route now (session-only) |",
    "| `/router pin <agent> <model>` | force one agent onto one model, persisted |",
    "| `/router unpin <agent>` | drop one pin |",
    "| `/router unpin` | drop every pin |",
    "| `/router debug <model>` | show one model's capabilities and score breakdown |",
    "| `/router probe <model>` | ping one model now and report the raw result |",
    "",
    "Pins live in memory for this session only and are lost on restart. For a",
    "permanent change, set `presets` in the plugin options or point the agent at",
    "`model-router/<agent>` directly.",
].join("\n");
export async function handleRouterCommand(prompt, context) {
    const { config, modelStore, router, say, session, ctx } = context;
    const command = parseCommand(prompt);
    const status = () => formatStatus(config, modelStore, router);
    const reassign = async (agents) => {
        return router.assignModels(agents).then(() => {
            if (!session.agent)
                return;
            const newModel = router.cachedAssignments.get(session.agent);
            if (newModel &&
                (newModel?.id !== session.model?.id ||
                    newModel?.providerID !== session.model?.providerID)) {
                return ctx.session.switchModel({
                    sessionID: session.id,
                    model: newModel,
                });
            }
        });
    };
    switch (command.kind) {
        case "status":
            void say(status());
            break;
        case "usable":
            void say(formatUsable(config, modelStore, router, (command.filter || session.agent)));
            break;
        case "refresh":
            void say("Refreshing the router...");
            if (command.agents) {
                await reassign(command.agents);
                void say(`Router refreshed for agents \`${command.agents?.join(", ")}\`.\n` +
                    status());
            }
            else {
                await reassign();
                void say("Router refreshed." + "\n" + status());
            }
            break;
        case "strategy":
            config.current.strategy = command.strategy;
            void say(`Routing strategy set to \`${command.strategy}\`. Re-routing...`);
            await reassign();
            void say(`Routing strategy set to \`${command.strategy}\`. Re-routing complete.` +
                "\n" +
                status());
            break;
        case "pin":
            router.pin(command.agent, command.model);
            await reassign();
            void say(`Pinned agent \`${command.agent}\` to model \`${command.model}\`.`);
            break;
        case "unpin":
            router.unpin(command.agent);
            await reassign();
            void say(`Unpinned agent \`${command.agent}\`.`);
            break;
        case "unpin-all":
            router.pins.clear();
            await reassign();
            void say("Unpinned every agent.");
            break;
        case "help":
            void say(HELP_TEXT);
            break;
        case "error":
            void say(`Error: ${command.message}`);
            break;
        case "debug": {
            const model = modelStore.getModel(command.modelRef);
            if (!model) {
                void say(`Model \`${command.modelRef}\` not found in the store. Similar models: ${modelStore
                    .getAllModels(command.modelRef)
                    .map((m) => `\`${m.target}\``)
                    .join(", ") || "none"}`);
                return;
            }
            void say(`Debug for model \`${command.modelRef}\`:\n\n\`\`\`json\n${JSON.stringify(model, null, 2)}\n\`\`\``);
            break;
        }
        case "probe": {
            const model = modelStore.getModel(command.modelRef);
            if (!model) {
                void say(`Model \`${command.modelRef}\` not found in the store. Similar models: ${modelStore
                    .getAllModels(command.modelRef)
                    .map((m) => `\`${m.target}\``)
                    .join(", ") || "none"}`);
                return;
            }
            void say(`Probing model \`${command.modelRef}\`...`);
            const result = await router.probe(model);
            modelStore.recordProbe(model.target, result);
            void say(`Probe result for model \`${command.modelRef}\`:\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``);
            break;
        }
        default:
            void say(`Unhandled command: ${prompt}`);
    }
}
