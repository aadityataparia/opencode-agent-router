/**
 * Which agents are routable depends on which orchestrator plugin is installed,
 * so routing every known agent unconditionally produces agents the user's setup
 * does not have. Each list below is that plugin's own agent list, read from its
 * published package: `BuiltinAgentNameSchema` in oh-my-opencode(-agent)'s
 * `agent-names.d.ts`, `ALL_AGENT_NAMES` in oh-my-opencode-slim's `constants.js`.
 */
/** Preset identifiers accepted by the `presets` option. */
export declare const PRESET_NAMES: readonly ["oh-my-opencode", "oh-my-openagent", "oh-my-opencode-slim"];
export type PresetName = (typeof PRESET_NAMES)[number];
export declare function isPresetName(value: string): value is PresetName;
/** Agents each preset defines; names this router has no requirements for are not routed. */
export declare const PRESET_AGENTS: Record<PresetName, readonly string[]>;
/** Union of every agent name across all presets, deduplicated. */
export declare function presetAgentNames(presets: readonly PresetName[]): string[];
/**
 * Detection reads the config's `plugin` list, not the package cache: a package
 * can sit in the cache after removal, and routing for an uninstalled plugin is
 * what this exists to prevent. Inconclusive detection returns every preset.
 */
export declare function detectPresets(): PresetName[];
