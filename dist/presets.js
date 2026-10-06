import { PRESET_NAMES } from "./types";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { logger } from "./logger";
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
const files = [
    resolve(homedir(), ".config", "opencode", "opencode.jsonc"),
    resolve(homedir(), ".config", "opencode", "opencode.json"),
    resolve(process.cwd(), "opencode.jsonc"),
    resolve(process.cwd(), "opencode.json"),
];
export function detectPresets(plugins) {
    const foundFromFile = [];
    for (const file of files) {
        try {
            const config = require(file);
            if (config?.presets) {
                for (const preset of config.presets) {
                    if (PRESET_NAMES.includes(preset)) {
                        foundFromFile.push(preset);
                    }
                }
            }
        }
        catch (e) {
            logger.error("Error in reading from file", file, e);
        }
    }
    if (foundFromFile.length > 0) {
        return foundFromFile;
    }
    const found = PRESET_NAMES.filter((preset) => plugins.some((entry) => entry.id === preset || entry.id?.startsWith(`${preset}@`)));
    return found;
}
