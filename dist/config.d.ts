import type { RouterConfig } from "./types";
/**
 * Every setting resolves in the same order: environment variable
 * (`OCO_ROUTER_*`), then plugin options, then the built-in default. Env wins
 * because it is the more ad-hoc layer — it is what a one-off
 * `OCO_ROUTER_LOG=true opencode` sets.
 */
/** The `ctx.options` object the host passes to `setup`. */
export type PluginOptions = Readonly<Record<string, unknown>>;
export declare function loadConfig(options?: PluginOptions): RouterConfig;
