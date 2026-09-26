import type { RouterConfig } from "./types";
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
export declare function loadConfig(options?: PluginOptions, log?: boolean): RouterConfig;
