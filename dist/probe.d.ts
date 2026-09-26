import type { DiscoveredModel } from "./types.js";
/**
 * Reachability probing.
 *
 * The catalog says a model exists; it does not say the model answers. A model
 * that is published but dead still looks like the best candidate on paper, and
 * routing to it fails on the first real request. A one-token ping turns that
 * into a fact the router can act on before it picks anything.
 */
/**
 * `unusable` is a verdict about the model. `inconclusive` means the probe could
 * not tell: a rejected credential or a throttled endpoint says nothing about
 * whether the model works, and must never be allowed to shrink the candidate
 * pool on its own.
 */
export type ProbeVerdict = "ok" | "unusable" | "inconclusive";
export interface ProbeResult {
    readonly verdict: ProbeVerdict;
    readonly latencyMs: number;
    readonly status?: number;
    readonly error?: string;
}
export interface ProbeOptions {
    /** OpenAI-compatible base URL of the endpoint traffic will actually use. */
    readonly baseURL: string;
    readonly apiKey: string;
    readonly timeoutMs: number;
}
export declare function probeModel(model: Pick<DiscoveredModel, "id" | "modelID">, options: ProbeOptions): Promise<ProbeResult>;
/** Runs `worker` over `items`, at most `limit` at a time, preserving order. */
export declare function mapWithConcurrency<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]>;
