import type { DiscoveredModel } from "./types";
/**
 * Reachability probing.
 *
 * The catalog says a model exists; it does not say the model answers. A model
 * that is published but dead still looks like the best candidate on paper, and
 * routing to it fails on the first real request. A one-token ping turns that
 * into a fact the router can act on before it picks anything.
 *
 * The ping is issued through OpenCode's own generate API rather than by hand
 * building a request. OpenCode already owns provider endpoints, SDK packages and
 * credentials — including credentials held in its auth store, which are not
 * visible in the config file and so cannot be forwarded by the router. Probing
 * the way real traffic is sent is both less code and the only check that
 * reflects what will actually happen at request time.
 */
/**
 * A verdict about one model.
 *
 * - `ok` answered.
 * - `unusable` the endpoint will not serve it.
 * - `unauthorized` the endpoint rejected our credential. Not the model's fault,
 *   but the model still cannot serve routed traffic, so it is excluded and the
 *   provider is reported for re-connection.
 * - `inconclusive` the probe could not tell (a throttled endpoint). Says
 *   nothing about the model, so it must never shrink the pool on its own.
 */
export type ProbeVerdict = "ok" | "unusable" | "unauthorized" | "inconclusive";
export interface ProbeResult {
    readonly verdict: ProbeVerdict;
    readonly latencyMs: number;
    readonly status?: number;
    readonly error?: string;
}
/** Runs one completion against a specific provider's model. */
export type GenerateText = (input: {
    readonly prompt: string;
    readonly model: {
        readonly id: string;
        readonly providerID: string;
        readonly variant?: string;
    };
}) => Promise<{
    readonly text: string;
}>;
export interface ProbeOptions {
    /** OpenCode's generate call, which resolves the endpoint and credentials. */
    readonly generate: GenerateText;
    readonly timeoutMs: number;
}
export declare function probeModel(model: Pick<DiscoveredModel, "id" | "modelID">, providerID: string, options: ProbeOptions): Promise<ProbeResult>;
/** Runs `worker` over `items`, at most `limit` at a time, preserving order. */
export declare function mapWithConcurrency<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]>;
