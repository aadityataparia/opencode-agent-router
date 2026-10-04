import { PluginListOutput } from "@opencode/client";
import { AgentName, PresetName } from "./types";
export declare const PRESET_AGENTS: Record<PresetName, readonly AgentName[]>;
export declare function presetAgentNames(presets: readonly PresetName[]): AgentName[];
export declare function detectPresets(plugins: PluginListOutput["data"]): PresetName[];
