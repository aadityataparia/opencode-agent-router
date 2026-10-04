import { PluginListOutput } from "@opencode/client";
import { AgentName, PRESET_NAMES, PresetName } from "./types";

const OMO_BUILTIN_AGENTS: AgentName[] = [
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
];

export const PRESET_AGENTS: Record<PresetName, readonly AgentName[]> = {
  "oh-my-opencode": OMO_BUILTIN_AGENTS,
  "oh-my-openagent": OMO_BUILTIN_AGENTS,
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

export function presetAgentNames(presets: readonly PresetName[]): AgentName[] {
  const names = new Set<AgentName>();
  for (const preset of presets) {
    for (const agent of PRESET_AGENTS[preset]) names.add(agent);
  }
  return [...names];
}

export function detectPresets(plugins: PluginListOutput["data"]): PresetName[] {
  const found = PRESET_NAMES.filter((preset) =>
    plugins.some(
      (entry) => entry.id === preset || entry.id?.startsWith(`${preset}@`),
    ),
  );

  return found;
}
