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
export declare const PRESET_NAMES: readonly ["oh-my-opencode", "oh-my-openagent", "oh-my-opencode-slim"];
export type PresetName = (typeof PRESET_NAMES)[number];
export declare function isPresetName(value: string): value is PresetName;
/**
 * Agents each preset defines, in the plugin's own naming.
 *
 * Kept as plain strings so a preset can list an agent this router has no
 * requirements for; unmatched agents are simply not routed.
 */
export declare const PRESET_AGENTS: Record<PresetName, readonly string[]>;
/** Union of every agent name across all presets, deduplicated. */
export declare function presetAgentNames(presets: readonly PresetName[]): string[];
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
export declare function detectPresets(): PresetName[];
/** Package name each preset ships under, for log messages. */
export declare function presetPackage(preset: PresetName): string;
