import { detectPresets, isPresetName, PRESET_NAMES, type PresetName } from "./presets";
import type { AgentRequirements, RouterConfig, RoutingStrategy } from "./types";

/**
 * Configuration resolution.
 *
 * Every setting resolves in the same order, so a value means the same thing no
 * matter where it came from:
 *
 *   1. environment variable  (`OCO_ROUTER_*`)
 *   2. plugin options in the OpenCode config
 *   3. built-in default
 *
 * Plugin options are the object in a `plugin` tuple entry:
 *
 *   "plugin": [
 *     ["git+…/opencode-agent-router.git#main", { "probe": true }]
 *   ]
 *
 * Env wins because it is the more specific, more ad-hoc layer: it is what a
 * one-off `OCO_ROUTER_LOG=true opencode` sets, and it must be able to override a
 * checked-in config without editing it.
 */

/** The `ctx.options` object the host passes to `setup`. */
export type PluginOptions = Readonly<Record<string, unknown>>;

const strategies: Set<RoutingStrategy> = new Set([
  "priority",
  "round-robin",
  "weighted",
  "latency",
  "rate",
  "adaptive",
]);

/** Where a resolved value came from, for the startup summary. */
type Source = "env" | "config" | "default";

const ENV_PREFIX = "OCO_ROUTER_";

function warn(message: string): void {
  // console.error so diagnostics surface in `--print-logs` output.
  console.error(`[opencode-agent-router] ${message}`);
}

class Resolver {
  private readonly origins = new Map<string, Source>();

  constructor(private readonly options: PluginOptions) {}

  /**
   * The raw value for a setting, honouring precedence.
   *
   * An empty environment variable is treated as unset: `OCO_ROUTER_PROBE=` in a
   * shell means "no preference here", and letting it win would silently mean
   * "false" over whatever the config asked for.
   */
  private raw(key: string): { value: unknown; source: Source } {
    const env = process.env[ENV_PREFIX + envSuffix(key)];
    if (env !== undefined && env.trim() !== "") {
      return { value: env, source: "env" };
    }

    const fromOptions = this.options[key];
    if (fromOptions !== undefined && fromOptions !== null) {
      return { value: fromOptions, source: "config" };
    }

    return { value: undefined, source: "default" };
  }

  source(key: string): Source {
    return this.origins.get(key) ?? "default";
  }

  private note(key: string, source: Source): void {
    this.origins.set(key, source);
  }

  /** A positive number. Zero and negatives are rejected as likely mistakes. */
  positiveNumber(key: string, fallback: number): number {
    const { value, source } = this.raw(key);
    if (value === undefined) return fallback;

    const parsed = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      warn(`ignoring invalid ${key}=${JSON.stringify(value)}; using ${fallback}`);
      return fallback;
    }

    this.note(key, source);
    return parsed;
  }

  /** A number clamped into range, for values where 0 is legitimate. */
  clampedNumber(key: string, fallback: number, min: number, max: number): number {
    const { value, source } = this.raw(key);
    if (value === undefined) return fallback;

    const parsed = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(parsed)) {
      warn(`ignoring invalid ${key}=${JSON.stringify(value)}; using ${fallback}`);
      return fallback;
    }

    this.note(key, source);
    return Math.min(max, Math.max(min, parsed));
  }

  boolean(key: string, fallback: boolean): boolean {
    const { value, source } = this.raw(key);
    if (value === undefined) return fallback;

    if (typeof value === "boolean") {
      this.note(key, source);
      return value;
    }

    const text = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(text)) {
      this.note(key, source);
      return true;
    }
    if (["0", "false", "no", "off"].includes(text)) {
      this.note(key, source);
      return false;
    }

    warn(`ignoring invalid ${key}=${JSON.stringify(value)}; using ${fallback}`);
    return fallback;
  }

  strategy(key: string, fallback: RoutingStrategy): RoutingStrategy {
    const { value, source } = this.raw(key);
    if (value === undefined) return fallback;

    const text = String(value).trim().toLowerCase() as RoutingStrategy;
    if (strategies.has(text)) {
      this.note(key, source);
      return text;
    }

    warn(
      `ignoring unknown ${key}=${JSON.stringify(value)}; using ${fallback}. Valid: ${[...strategies].join(", ")}`,
    );
    return fallback;
  }

  /**
   * Preset list, accepting a comma-separated string (env) or an array (config).
   *
   * Returns `undefined` when nothing usable was given, which is what selects
   * auto-detection.
   */
  presets(key: string): PresetName[] | undefined {
    const { value, source } = this.raw(key);
    if (value === undefined) return undefined;

    const requested = (Array.isArray(value)
      ? value.map((entry) => String(entry))
      : String(value).split(",")
    )
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);

    if (requested.length === 0) return undefined;

    const known = requested.filter(isPresetName);
    const unknown = requested.filter((entry) => !isPresetName(entry));
    if (unknown.length > 0) {
      warn(
        `ignoring unknown preset(s) ${unknown.join(", ")}; valid: ${PRESET_NAMES.join(", ")}`,
      );
    }
    if (known.length === 0) return undefined;

    this.note(key, source);
    return known;
  }

  /** A plain object of agent requirement overrides. */
  agents(key: string): Record<string, AgentRequirements> {
    const { value, source } = this.raw(key);
    if (value === undefined) return {};

    if (typeof value !== "object" || Array.isArray(value)) {
      warn(`ignoring ${key}: expected an object of agent names`);
      return {};
    }

    this.note(key, source);
    return value as Record<string, AgentRequirements>;
  }
}

/** Config key -> environment variable suffix. */
function envSuffix(key: string): string {
  return key.replace(/[A-Z]/g, (char) => `_${char}`).toUpperCase();
}

export function loadConfig(
  options: PluginOptions = {},
  log = false,
): RouterConfig {
  const resolve = new Resolver(options);

  // Logging is resolved first so everything below can report through the same
  // switch the user set.
  const verbose = resolve.boolean("log", false);

  const configured = resolve.presets("presets");
  const presets = configured ?? detectPresets();

  const config: RouterConfig = {
    refreshMs: resolve.positiveNumber("refreshMs", 60_000),
    maxFallbacks: Math.max(
      1,
      Math.floor(resolve.positiveNumber("maxFallbacks", 5)),
    ),
    probe: resolve.boolean("probe", false),
    probeTimeoutMs: resolve.positiveNumber("probeTimeoutMs", 8_000),
    strategy: resolve.strategy("strategy", "adaptive"),
    minHealth: resolve.clampedNumber("minHealth", 0.2, 0, 1),
    log: verbose,
    presets,
    agents: resolve.agents("agents"),
  };

  if (log || verbose) {
    const origin = configured ? resolve.source("presets") : "detected";
    const overridden = Object.entries(config)
      .filter(([key]) => resolve.source(key as keyof RouterConfig) !== "default")
      .map(([key]) => `${key}(${resolve.source(key as keyof RouterConfig)})`)
      .join(" ");

    warn(
      `routing for preset(s): ${presets.join(", ") || "(none)"} (${origin})` +
        (overridden ? ` | set: ${overridden}` : " | all defaults"),
    );
  }

  return config;
}
