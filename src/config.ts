import type { RouterConfig, RoutingStrategy } from "./types.js";

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const strategies: Set<RoutingStrategy> = new Set([
  "priority",
  "round-robin",
  "weighted",
  "latency",
  "rate",
  "adaptive",
]);

export function loadConfig(): RouterConfig {
  const raw = process.env.OCO_ROUTER_STRATEGY ?? "adaptive";
  const strategy = strategies.has(raw as RoutingStrategy)
    ? (raw as RoutingStrategy)
    : "adaptive";

  return {
    refreshMs: numberEnv("OCO_ROUTER_REFRESH_MS", 60_000),
    maxFallbacks: Math.max(
      1,
      Math.floor(numberEnv("OCO_ROUTER_MAX_FALLBACKS", 5)),
    ),
    probe: boolEnv("OCO_ROUTER_PROBE", false),
    probeTimeoutMs: numberEnv("OCO_ROUTER_PROBE_TIMEOUT_MS", 8_000),
    strategy,
    minHealth: Math.min(
      1,
      Math.max(0, Number(process.env.OCO_ROUTER_MIN_HEALTH ?? 0.2)),
    ),
    log: boolEnv("OCO_ROUTER_LOG", false),
  };
}
