import { AGENT_REQUIREMENTS } from "./agents";
import { logger } from "./logger";
import { presetAgentNames } from "./presets";
import {
  AgentRequirements,
  PresetName,
  RouterConfig,
  RoutingStrategy,
  STRATEGY_NAMES,
} from "./types";

const DEFAULTS: Partial<RouterConfig> = {
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
  constructor(
    private readonly raw: Partial<RouterConfig>,
    private readonly detectedPresets: PresetName[] = [],
  ) {}

  get current(): RouterConfig {
    const config: RouterConfig = {
      refreshMs: this.positiveNumber("refreshMs"),
      maxFallbacks: Math.max(
        1,
        Math.floor(this.positiveNumber("maxFallbacks")),
      ),
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

  array<T>(key: keyof RouterConfig): T[] | undefined {
    const value = this.raw[key];
    if (value === undefined) return undefined;

    if (!Array.isArray(value)) {
      logger.trace(`ignoring ${key}: expected an array`);
      return undefined;
    }

    return value as T[];
  }

  boolean(key: keyof RouterConfig, defaultValue: boolean): boolean {
    const value = this.raw[key];
    if (value === undefined) return defaultValue;

    if (typeof value !== "boolean") {
      logger.trace(`ignoring ${key}: expected a boolean`);
      return defaultValue;
    }

    return value;
  }

  positiveNumber(key: keyof RouterConfig): number {
    const value = this.raw[key];
    if (value === undefined) return DEFAULTS[key] as number;

    if (typeof value !== "number" || value <= 0) {
      logger.trace(`ignoring ${key}: expected a positive number`);
      return DEFAULTS[key] as number;
    }

    return value;
  }

  clampedNumber(key: keyof RouterConfig, min: number, max: number): number {
    const value = this.raw[key];
    if (value === undefined) return DEFAULTS[key] as number;

    if (typeof value !== "number" || value < min || value > max) {
      logger.trace(
        `ignoring ${key}: expected a number between ${min} and ${max}`,
      );
      return DEFAULTS[key] as number;
    }

    return value;
  }

  strategy(): RoutingStrategy {
    const value = this.raw.strategy;
    if (value === undefined) return DEFAULTS.strategy as RoutingStrategy;

    if (typeof value !== "string" || !STRATEGY_NAMES.includes(value)) {
      logger.trace(
        `ignoring options.strategy: expected a routing strategy (${DEFAULTS.strategy} fallback)`,
      );
      return DEFAULTS.strategy as RoutingStrategy;
    }

    return value;
  }

  agents(): Record<string, AgentRequirements> {
    let value = this.raw.agents;

    if (typeof value !== "object" || Array.isArray(value)) {
      logger.trace(
        `ignoring options.agents: expected an object of agent names`,
      );
      value = {};
    }

    const presets = presetAgentNames(this.raw.presets ?? this.detectedPresets);

    const origin = this.raw.presets ? "options" : "detected";
    const overridden = this.raw.agents
      ? Object.keys(this.raw.agents)
      : undefined;

    logger.trace(
      `routing for agents(s): ${presets?.join(", ") || "(none)"} (${origin} presets)` +
        (overridden ? ` and options.agents: ${overridden}` : ""),
    );

    return {
      ...presets.reduce(
        (acc, agent) => {
          acc[agent] = AGENT_REQUIREMENTS[agent];
          return acc;
        },
        {} as Record<string, AgentRequirements>,
      ),
      ...value,
    } as Record<string, AgentRequirements>;
  }
}
