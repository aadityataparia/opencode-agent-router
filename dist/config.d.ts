import type { RouterConfig, RoutingStrategy } from "./types";
/**
 * Every setting resolves in the same order: environment variable
 * (`OCO_ROUTER_*`), then plugin options, then the built-in default. Env wins
 * because it is the more ad-hoc layer — it is what a one-off
 * `OCO_ROUTER_LOG=true opencode` sets.
 */
/** The `ctx.options` object the host passes to `setup`. */
export type PluginOptions = Readonly<Record<string, unknown>>;
/** Every strategy the router can be asked for, in the order they are offered. */
export declare const STRATEGY_NAMES: readonly ["adaptive", "latency", "cost", "weighted", "round-robin"];
export declare function isRoutingStrategy(value: string): value is RoutingStrategy;
export declare function loadConfig(options?: PluginOptions): RouterConfig;
