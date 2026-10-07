import { SessionInfo } from "@opencode/client";
import { Config } from "./config";
import { ModelStore } from "./model-store";
import { Router } from "./router";
import type { AgentName, Candidate, RouterConfig, RoutingStrategy } from "./types";
import { Context } from "@opencode/plugin/promise/plugin";
/**
 * Pure parsing and rendering for `/router`: the handler in `index.ts` owns the
 * state and the side effects. Output goes out as a synthetic session message, so
 * a command costs no model call and cannot be paraphrased.
 */
export declare const ROUTER_COMMAND = "router";
export type ParsedCommand = {
    kind: "status";
} | {
    kind: "help";
} | {
    kind: "refresh";
    agents?: string[];
} | {
    kind: "strategy";
    strategy: RoutingStrategy;
} | {
    kind: "usable";
    filter?: string;
} | {
    kind: "pin";
    agent: string;
    model: string;
} | {
    kind: "unpin";
    agent: string;
} | {
    kind: "unpin-all";
} | {
    kind: "error";
    message: string;
} | {
    kind: "debug";
    modelRef: string;
} | {
    kind: "probe";
    modelRef: string;
};
export declare function parseCommand(text: string): ParsedCommand;
export interface StatusView {
    config: RouterConfig;
    /** Agent -> chosen model for the routed agents currently published. */
    assignments: ReadonlyMap<string, Candidate>;
    /** Agent -> pinned model ref. */
    pins: ReadonlyMap<string, string>;
    /** Agents eligible for routing under the active presets. */
    routedAgents: readonly string[];
    currentAgent?: string;
    discovered: number;
    /** Models left in the pool after probing. */
    routable: number;
    /** The pool itself; only `/router usable` renders it. */
    pool?: readonly Candidate[];
    coolingDown: number;
    /** Provider -> models rejected for auth, sticky across passes. */
    authBlocked: readonly (readonly [string, number])[];
    lastRun: {
        at: number;
        reason: string;
        probed: number;
        usable: number;
    } | undefined;
    refreshMs: number;
    now: number;
}
export declare function tableRow(...cells: string[]): string;
export declare function table(header: string[], rows: string[][]): string;
export declare function formatStatus(config: Config, store: ModelStore, router: Router): string;
/** The pool a routing pass can choose from, for `/router usable`. */
export declare function formatUsable(config: Config, store: ModelStore, router: Router, agent?: AgentName): string;
export declare const HELP_TEXT: string;
export declare function handleRouterCommand(prompt: string, context: {
    ctx: Context;
    config: Config;
    modelStore: ModelStore;
    router: Router;
    say: (text: string) => Promise<void>;
    session: SessionInfo;
}): Promise<void>;
