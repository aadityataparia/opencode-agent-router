import { detectPresets, isPresetName } from "./presets";
function numberEnv(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}
function boolEnv(name, fallback) {
    const value = process.env[name];
    if (value == null)
        return fallback;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
/**
 * Read the preset list from `OCO_ROUTER_PRESETS` (comma-separated).
 *
 * Returns `undefined` when the variable is unset *or* empty, which is what
 * selects auto-detection. An empty value is treated as unset on purpose: a
 * variable exported as `OCO_ROUTER_PRESETS=` means "no preference", and silently
 * routing for zero agents would look like the router had broken.
 */
function presetsEnv() {
    const raw = process.env.OCO_ROUTER_PRESETS;
    if (raw === undefined)
        return undefined;
    const requested = raw
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);
    if (requested.length === 0)
        return undefined;
    const known = requested.filter(isPresetName);
    const unknown = requested.filter((value) => !isPresetName(value));
    if (unknown.length > 0) {
        console.error(`[opencode-agent-router] ignoring unknown preset(s) in OCO_ROUTER_PRESETS: ${unknown.join(", ")}`);
    }
    return known;
}
const strategies = new Set([
    "priority",
    "round-robin",
    "weighted",
    "latency",
    "rate",
    "adaptive",
]);
export function loadConfig(log = false) {
    const raw = process.env.OCO_ROUTER_STRATEGY ?? "adaptive";
    const strategy = strategies.has(raw)
        ? raw
        : "adaptive";
    const configured = presetsEnv();
    const presets = configured ?? detectPresets();
    if (log) {
        const source = configured ? "OCO_ROUTER_PRESETS" : "detected from config";
        console.error(`[opencode-agent-router] routing for preset(s): ${presets.join(", ") || "(none)"} (${source})`);
    }
    return {
        refreshMs: numberEnv("OCO_ROUTER_REFRESH_MS", 60_000),
        maxFallbacks: Math.max(1, Math.floor(numberEnv("OCO_ROUTER_MAX_FALLBACKS", 5))),
        probe: boolEnv("OCO_ROUTER_PROBE", false),
        probeTimeoutMs: numberEnv("OCO_ROUTER_PROBE_TIMEOUT_MS", 8_000),
        strategy,
        minHealth: Math.min(1, Math.max(0, Number(process.env.OCO_ROUTER_MIN_HEALTH ?? 0.2))),
        log: log || boolEnv("OCO_ROUTER_LOG", false),
        presets,
    };
}
