import type { DiscoveredModel, RouterConfig } from "./types";
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
};
export declare function parseCommand(text: string): ParsedCommand;
/** Canonical `provider/model` identity used for pins and display. */
export declare function modelRef(model: Pick<DiscoveredModel, "providerID" | "id" | "modelID">): string;
/**
 * Accepts `provider/model` or a bare `model`, but a bare name only when it is
 * unambiguous — silently picking between same-named models would route an agent
 * somewhere the user did not choose.
 */
export declare function findModel(models: readonly DiscoveredModel[], ref: string): DiscoveredModel | undefined;
/** How many models a bare reference is ambiguous between, for a better error. */
export declare function countMatches(models: readonly DiscoveredModel[], ref: string): number;
export interface StatusView {
    config: RouterConfig;
    /** Agent -> chosen model for the routed agents currently published. */
    assignments: ReadonlyMap<string, DiscoveredModel>;
    /** Agent -> pinned model ref. */
    pins: ReadonlyMap<string, string>;
    /** Agents eligible for routing under the active presets. */
    routedAgents: readonly string[];
    discovered: number;
    /** Models left in the pool after probing. */
    routable: number;
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
export declare function formatStatus(view: StatusView): string;
export declare const HELP_TEXT: string;
