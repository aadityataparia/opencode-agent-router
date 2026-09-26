import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Agent presets.
 *
 * The router publishes one alias per managed agent. Which agents those are
 * depends entirely on which orchestrator plugin the user actually runs, so
 * routing every known agent unconditionally produces aliases for agents that do
 * not exist in the user's setup — clutter in the model list, and wasted model
 * discovery on every refresh.
 *
 * Each list below is that plugin's own canonical agent list, read from its
 * published package rather than hand-maintained:
 *
 * - `oh-my-opencode` / `oh-my-openagent`: the `BuiltinAgentNameSchema` enum in
 *   `<pkg>/dist/config/schema/agent-names.d.ts`. Both ship the same 11 names.
 * - `oh-my-opencode-slim`: `ALL_AGENT_NAMES` in
 *   `<pkg>/dist/config/constants.js` (`orchestrator` plus `SUBAGENT_NAMES`).
 */

/** Preset identifiers accepted by the `presets` option. */
export const PRESET_NAMES = [
  "oh-my-opencode",
  "oh-my-openagent",
  "oh-my-opencode-slim",
] as const;

export type PresetName = (typeof PRESET_NAMES)[number];

/** npm package that provides each preset. */
const PRESET_PACKAGES: Record<PresetName, string> = {
  "oh-my-opencode": "oh-my-opencode",
  "oh-my-openagent": "oh-my-openagent",
  "oh-my-opencode-slim": "oh-my-opencode-slim",
};

export function isPresetName(value: string): value is PresetName {
  return (PRESET_NAMES as readonly string[]).includes(value);
}

/**
 * Agents each preset defines, in the plugin's own naming.
 *
 * Kept as plain strings so a preset can list an agent this router has no
 * requirements for; unmatched agents are simply not routed.
 */
export const PRESET_AGENTS: Record<PresetName, readonly string[]> = {
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
export function presetAgentNames(presets: readonly PresetName[]): string[] {
  const names = new Set<string>();
  for (const preset of presets) {
    for (const agent of PRESET_AGENTS[preset]) names.add(agent);
  }
  return [...names];
}

/**
 * Detect which presets are installed.
 *
 * The signal is deliberately the config file's `plugin` list rather than the
 * package cache: a package can sit in `~/.cache/opencode` long after it was
 * removed from the config, and routing for a plugin the user uninstalled is
 * exactly the failure this module exists to prevent.
 *
 * Returns every preset when detection is inconclusive, which preserves the
 * pre-preset behaviour instead of silently routing for nothing.
 */
export function detectPresets(): PresetName[] {
  const declared = readDeclaredPlugins();
  if (declared === undefined) return [...PRESET_NAMES];

  const found = PRESET_NAMES.filter((preset) => {
    const pkg = PRESET_PACKAGES[preset];
    return declared.some((entry) => entry === pkg || entry.startsWith(`${pkg}@`));
  });

  return found;
}

/**
 * Plugin names from the OpenCode config.
 *
 * `present` is false when no config could be read at all, which is different
 * from a config that lists no matching plugins.
 */
function readDeclaredPlugins(): string[] | undefined {
  const names: string[] = [];

  for (const file of configFiles()) {
    const raw = readConfigFile(file);
    if (raw === undefined) continue;
    names.push(...extractPluginEntries(raw));
  }

  return names.length > 0 ? names : undefined;
}

/** Config locations OpenCode reads, most specific first. */
function configFiles(): string[] {
  const home = homedir();
  const fromEnv = process.env.OPENCODE_CONFIG?.trim();
  const files = fromEnv ? [fromEnv] : [];

  files.push(
    join(home, ".config", "opencode", "opencode.json"),
    join(home, ".config", "opencode", "opencode.jsonc"),
    join(process.cwd(), "opencode.json"),
    join(process.cwd(), "opencode.jsonc"),
  );
  return files;
}

function readConfigFile(path: string): string | undefined {
  try {
    if (!statSync(path).isFile()) return undefined;
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Pull plugin identifiers out of a config without a JSONC parser.
 *
 * Only the `plugin`/`plugins` array is read, and only its string elements.
 * A hand-rolled JSONC parse would have to handle comments, trailing commas and
 * escapes correctly to be trustworthy; a bounded scan for the one array this
 * needs cannot silently mangle the rest of the file.
 */
function extractPluginEntries(raw: string): string[] {
  const entries: string[] = [];
  const keyPattern = /"(?:plugin|plugins)"\s*:\s*\[/g;

  for (const match of raw.matchAll(keyPattern)) {
    const start = (match.index ?? 0) + match[0].length;
    const end = findArrayEnd(raw, start);
    if (end === undefined) continue;

    for (const element of raw.slice(start, end).matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      entries.push(unescapeJson(element[1] ?? ""));
    }
  }

  return entries;
}

/** Index just past the `]` closing the array that starts at `start`. */
function findArrayEnd(raw: string, start: number): number | undefined {
  let depth = 1;
  let inString = false;

  for (let i = start; i < raw.length; i++) {
    const char = raw[i];

    if (inString) {
      if (char === "\\") i++;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) return i;
  }

  return undefined;
}

function unescapeJson(value: string): string {
  return value.replace(/\\(.)/g, (_, char: string) => {
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
export function presetPackage(preset: PresetName): string {
  return PRESET_PACKAGES[preset];
}
