import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * Which agents are routable depends on which orchestrator plugin is installed,
 * so routing every known agent unconditionally produces agents the user's setup
 * does not have. Each list below is that plugin's own agent list, read from its
 * published package: `BuiltinAgentNameSchema` in oh-my-opencode(-agent)'s
 * `agent-names.d.ts`, `ALL_AGENT_NAMES` in oh-my-opencode-slim's `constants.js`.
 */
/** Preset identifiers accepted by the `presets` option. */
export const PRESET_NAMES = [
    "oh-my-opencode",
    "oh-my-openagent",
    "oh-my-opencode-slim",
];
/** npm package that provides each preset. */
const PRESET_PACKAGES = {
    "oh-my-opencode": "oh-my-opencode",
    "oh-my-openagent": "oh-my-openagent",
    "oh-my-opencode-slim": "oh-my-opencode-slim",
};
export function isPresetName(value) {
    return PRESET_NAMES.includes(value);
}
/** Agents each preset defines; names this router has no requirements for are not routed. */
export const PRESET_AGENTS = {
    "oh-my-opencode": [
        "sisyphus",
        "hephaestus",
        "prometheus",
        "atlas",
        "oracle",
        "librarian",
        "explore",
        "multimodal-looker",
        "metis",
        "momus",
        "sisyphus-junior",
    ],
    // Same lineage and the same 11 builtin names as oh-my-opencode.
    "oh-my-openagent": [
        "sisyphus",
        "hephaestus",
        "prometheus",
        "atlas",
        "oracle",
        "librarian",
        "explore",
        "multimodal-looker",
        "metis",
        "momus",
        "sisyphus-junior",
    ],
    "oh-my-opencode-slim": [
        "orchestrator",
        "explorer",
        "librarian",
        "oracle",
        "designer",
        "fixer",
        "observer",
        "council",
        "councillor",
    ],
};
/** Union of every agent name across all presets, deduplicated. */
export function presetAgentNames(presets) {
    const names = new Set();
    for (const preset of presets) {
        for (const agent of PRESET_AGENTS[preset])
            names.add(agent);
    }
    return [...names];
}
/**
 * Detection reads the config's `plugin` list, not the package cache: a package
 * can sit in the cache after removal, and routing for an uninstalled plugin is
 * what this exists to prevent. Inconclusive detection returns every preset.
 */
export function detectPresets() {
    const declared = readDeclaredPlugins();
    if (declared === undefined)
        return [...PRESET_NAMES];
    const found = PRESET_NAMES.filter((preset) => {
        const pkg = PRESET_PACKAGES[preset];
        return declared.some((entry) => entry === pkg || entry.startsWith(`${pkg}@`));
    });
    return found;
}
/** Plugin names from the config; `present` is false when no config could be read. */
function readDeclaredPlugins() {
    const names = [];
    for (const file of configFiles()) {
        const raw = readConfigFile(file);
        if (raw === undefined)
            continue;
        names.push(...extractPluginEntries(raw));
    }
    return names.length > 0 ? names : undefined;
}
/** Config locations OpenCode reads, most specific first. */
function configFiles() {
    const home = homedir();
    const fromEnv = process.env.OPENCODE_CONFIG?.trim();
    const files = fromEnv ? [fromEnv] : [];
    files.push(join(home, ".config", "opencode", "opencode.json"), join(home, ".config", "opencode", "opencode.jsonc"), join(process.cwd(), "opencode.json"), join(process.cwd(), "opencode.jsonc"));
    return files;
}
function readConfigFile(path) {
    try {
        if (!statSync(path).isFile())
            return undefined;
        return readFileSync(path, "utf8");
    }
    catch {
        return undefined;
    }
}
/**
 * Reads only the `plugin`/`plugins` array, so no JSONC parser is needed: a
 * bounded scan cannot mangle the rest of the file.
 */
function extractPluginEntries(raw) {
    const entries = [];
    const keyPattern = /"(?:plugin|plugins)"\s*:\s*\[/g;
    for (const match of raw.matchAll(keyPattern)) {
        const start = (match.index ?? 0) + match[0].length;
        const end = findArrayEnd(raw, start);
        if (end === undefined)
            continue;
        for (const element of raw.slice(start, end).matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
            entries.push(unescapeJson(element[1] ?? ""));
        }
    }
    return entries;
}
/** Index just past the `]` closing the array that starts at `start`. */
function findArrayEnd(raw, start) {
    let depth = 1;
    let inString = false;
    for (let i = start; i < raw.length; i++) {
        const char = raw[i];
        if (inString) {
            if (char === "\\")
                i++;
            else if (char === '"')
                inString = false;
            continue;
        }
        if (char === '"')
            inString = true;
        else if (char === "[")
            depth++;
        else if (char === "]" && --depth === 0)
            return i;
    }
    return undefined;
}
function unescapeJson(value) {
    return value.replace(/\\(.)/g, (_, char) => {
        switch (char) {
            case "n":
                return "\n";
            case "t":
                return "\t";
            case "r":
                return "\r";
            default:
                return char;
        }
    });
}
/** Package name each preset ships under, for log messages. */
export function presetPackage(preset) {
    return PRESET_PACKAGES[preset];
}
