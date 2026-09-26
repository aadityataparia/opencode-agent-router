import type { DiscoveredModel, RouterConfig } from "./types";
/**
 * Parsing and rendering for the `/router` slash command.
 *
 * Everything here is pure: it takes the text the user typed plus a snapshot of
 * router state, and returns either a decision or a block of Markdown. The
 * command handler in `index.ts` owns the mutable state and the side effects.
 *
 * Output goes to the session as a *synthetic* message rather than a prompt, so
 * showing status or applying a pin costs no model call and cannot be ignored or
 * paraphrased by the model.
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
 * Resolve a user-typed model reference against the catalog.
 *
 * Accepts `provider/model` and a bare `model`, because listing 37 models to
 * find the one provider prefix is busywork. A bare name is only accepted when it
 * is unambiguous; silently picking one of several same-named models across
 * providers would route an agent somewhere the user did not choose.
 */
export declare function findModel(models: readonly DiscoveredModel[], ref: string): DiscoveredModel | undefined;
/** How many models a bare reference is ambiguous between, for a better error. */
export declare function countMatches(models: readonly DiscoveredModel[], ref: string): number;
export interface StatusView {
    config: RouterConfig;
    /** Agent -> chosen model for the aliases currently published. */
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
