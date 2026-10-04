import { AGENT_REQUIREMENTS } from "./agents";
import { logger } from "./logger";
import { presetAgentNames } from "./presets";
import { STRATEGY_NAMES, } from "./types";
const DEFAULTS = {
    refreshMs: 60 * 60_000,
    maxFallbacks: 5,
    probe: false,
    probeTimeoutMs: 8_000,
    strategy: "adaptive",
    minHealth: 0.5,
    agents: {},
    ignoredProviders: [],
};
export class Config {
    raw;
    detectedPresets;
    constructor(raw, detectedPresets = []) {
        this.raw = raw;
        this.detectedPresets = detectedPresets;
    }
    get current() {
        const config = {
            refreshMs: this.positiveNumber("refreshMs"),
            maxFallbacks: Math.max(1, Math.floor(this.positiveNumber("maxFallbacks"))),
            probe: this.boolean("probe", false),
            probeTimeoutMs: this.positiveNumber("probeTimeoutMs"),
            strategy: this.strategy(),
            minHealth: this.clampedNumber("minHealth", 0, 1),
            presets: this.array("presets") ?? this.detectedPresets,
            agents: this.agents(),
            ignoredProviders: this.array("ignoredProviders") ?? [],
        };
        return config;
    }
    array(key) {
        const value = this.raw[key];
        if (value === undefined)
            return undefined;
        if (!Array.isArray(value)) {
            logger.trace(`ignoring ${key}: expected an array`);
            return undefined;
        }
        return value;
    }
    boolean(key, defaultValue) {
        const value = this.raw[key];
        if (value === undefined)
            return defaultValue;
        if (typeof value !== "boolean") {
            logger.trace(`ignoring ${key}: expected a boolean`);
            return defaultValue;
        }
        return value;
    }
    positiveNumber(key) {
        const value = this.raw[key];
        if (value === undefined)
            return DEFAULTS[key];
        if (typeof value !== "number" || value <= 0) {
            logger.trace(`ignoring ${key}: expected a positive number`);
            return DEFAULTS[key];
        }
        return value;
    }
    clampedNumber(key, min, max) {
        const value = this.raw[key];
        if (value === undefined)
            return DEFAULTS[key];
        if (typeof value !== "number" || value < min || value > max) {
            logger.trace(`ignoring ${key}: expected a number between ${min} and ${max}`);
            return DEFAULTS[key];
        }
        return value;
    }
    strategy() {
        const value = this.raw.strategy;
        if (value === undefined)
            return DEFAULTS.strategy;
        if (typeof value !== "string" || !STRATEGY_NAMES.includes(value)) {
            logger.trace(`ignoring options.strategy: expected a routing strategy (${DEFAULTS.strategy} fallback)`);
            return DEFAULTS.strategy;
        }
        return value;
    }
    agents() {
        let value = this.raw.agents;
        if (typeof value !== "object" || Array.isArray(value)) {
            logger.trace(`ignoring options.agents: expected an object of agent names`);
            value = {};
        }
        const presets = presetAgentNames(this.raw.presets ?? this.detectedPresets);
        const origin = this.raw.presets ? "options" : "detected";
        const overridden = this.raw.agents
            ? Object.keys(this.raw.agents)
            : undefined;
        logger.trace(`routing for agents(s): ${presets?.join(", ") || "(none)"} (${origin} presets)` +
            (overridden ? ` and options.agents: ${overridden}` : ""));
        return {
            ...presets.reduce((acc, agent) => {
                acc[agent] = AGENT_REQUIREMENTS[agent];
                return acc;
            }, {}),
            ...value,
        };
    }
}
