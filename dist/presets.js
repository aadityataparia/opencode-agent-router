import { PRESET_NAMES } from "./types";
const OMO_BUILTIN_AGENTS = [
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
export const PRESET_AGENTS = {
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
export function presetAgentNames(presets) {
    const names = new Set();
    for (const preset of presets) {
        for (const agent of PRESET_AGENTS[preset])
            names.add(agent);
    }
    return [...names];
}
export function detectPresets(plugins) {
    const found = PRESET_NAMES.filter((preset) => plugins.some((entry) => entry.id === preset || entry.id?.startsWith(`${preset}@`)));
    return found;
}
