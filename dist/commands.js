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
            : { kind: "error", message: `\`refresh\` takes no arguments.` };
    }
    if (verb === "help" || verb === "?")
        return { kind: "help" };
    if (verb === "unpin") {
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
    if (verb === "reset")
        return { kind: "unpin-all" };
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
/**
 * Accepts `provider/model` or a bare `model`, but a bare name only when it is
 * unambiguous — silently picking between same-named models would route an agent
 * somewhere the user did not choose.
 */
export function findModel(models, ref) {
    const wanted = normalize(ref);
    const byQualified = models.filter((model) => normalize(model.target) === wanted);
    if (byQualified.length > 0)
        return byQualified[0];
    const byBare = models.filter((model) => normalize(model.id) === wanted ||
        (model.modelID !== undefined && normalize(model.modelID) === wanted));
    if (byBare.length === 1)
        return byBare[0];
    return undefined;
}
/** How many models a bare reference is ambiguous between, for a better error. */
export function countMatches(models, ref) {
    const wanted = normalize(ref);
    return models.filter((model) => model.target.includes(wanted));
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
        return `${model.health.toFixed(2)} (cooling)`;
    }
    return model.health.toFixed(2);
}
export function formatStatus(view) {
    const { config } = view;
    const lines = [];
    lines.push(`**model-router** · ${config.strategy} · probe ${config.probe ? "on" : "off"} · presets: ${config.presets.join(", ") || "none detected"}`);
    lines.push("");
    const routed = view.routedAgents;
    if (routed.length === 0) {
        lines.push("No agents are in scope. Set `presets` in the plugin options, or declare an `agents` entry.");
    }
    else {
        lines.push("| agent | model | health | latency | note |", "| --- | --- | --- | --- | --- |");
        for (const agent of routed) {
            const { model } = view.assignments.get(agent) ?? {};
            const pin = view.pins.get(agent);
            if (!model) {
                const note = pin ? "pinned model unavailable" : "no candidate";
                lines.push(`| \`${agent}\` | — | — | — | ${note} |`);
                continue;
            }
            const notes = [];
            if (pin) {
                // A pin that no longer resolves would otherwise look identical to a
                // satisfied one, which is the kind of thing that goes unnoticed for days.
                notes.push(normalize(model.target) === normalize(pin)
                    ? "pinned"
                    : `pin \`${pin}\` unavailable, routed instead`);
            }
            if (view.authBlocked.some(([provider]) => provider === model.providerID)) {
                notes.push("auth blocked");
            }
            lines.push(`| \`${agent}\` | \`${model.target}\` | ${healthCell(model, view.now)} | ${Number.isFinite(model.latencyMs) ? `${model.latencyMs.toFixed(0)}ms` : "—"} | ${notes.join("; ") || "—"} |`);
        }
    }
    lines.push("");
    lines.push(`${view.discovered} model(s) discovered · ${view.routable} routable · ${view.coolingDown} cooling down`);
    if (view.authBlocked.length > 0) {
        const detail = view.authBlocked
            .map(([provider, count]) => `\`${provider}\` (${count})`)
            .join(", ");
        lines.push(`⚠ auth blocked: ${detail} — reconnect with \`opencode auth login\``);
    }
    if (view.lastRun) {
        const { at, reason, probed, usable } = view.lastRun;
        const probeNote = config.probe
            ? ` · probed ${usable}/${probed} usable`
            : "";
        lines.push(`last refresh ${formatDuration(view.now - at)} ago (${reason})${probeNote} · next in ${formatDuration(config.refreshMs)}`);
    }
    else {
        lines.push(`no refresh has completed yet · next in ${formatDuration(config.refreshMs)}`);
    }
    return lines.join("\n");
}
/** The pool a routing pass can choose from, for `/router usable`. */
export function formatUsable(view) {
    const lines = [];
    const pool = [...(view.pool ?? [])].sort((a, b) => b.score - a.score);
    if (pool.length === 0) {
        return [
            "No models are routable right now.",
            "",
            "Every discovered model is either unusable or in cooldown. Run",
            "`/router refresh` to re-probe, and check the status for an auth block.",
        ].join("\n");
    }
    lines.push(`**${view.routable} model(s) routable** · ${pool.length} usable for ${view.currentAgent} · probe ${view.config.probe ? "on" : "off"} · ${view.discovered} discovered`, "", `| model | health | score (for ${view.currentAgent}) | latency |`, "| --- | --- | --- | --- |");
    for (const { model, score } of pool) {
        const latency = Number.isFinite(model.latencyMs) && model.latencyMs > 0
            ? `${model.latencyMs.toFixed(0)}ms`
            : "—";
        const seen = model.lastProbeAt === undefined
            ? ""
            : ` · ${model.successes} ok / ${model.failures} failed`;
        lines.push(`| \`${model.target}\` | ${healthCell(model, view.now)}${seen} | ${score.toFixed(2)} | ${latency} |`);
    }
    return lines.join("\n");
}
export const HELP_TEXT = [
    "**/router** — inspect and steer the model router",
    "",
    "| command | effect |",
    "| --- | --- |",
    "| `/router` | show routing status |",
    "| `/router usable` | list every model the router can currently pick |",
    "| `/router refresh` | re-scan providers and re-probe now, ignoring probe cache and cooldown |",
    "| `/router pin <agent> <model>` | force one agent onto one model |",
    "| `/router unpin <agent>` | drop one pin |",
    "| `/router unpin` | drop every pin |",
    "| `/router debug <model>` | show one model's capabilities and score breakdown |",
    "| `/router probe <model>` | ping one model now and report the raw result |",
    "",
    "Pins live in memory for this session only and are lost on restart. For a",
    "permanent change, set `presets` in the plugin options or point the agent at",
    "`model-router/<agent>` directly.",
].join("\n");
