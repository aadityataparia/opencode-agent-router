import type { DiscoveredModel } from "./types";
/**
 * Probes go through OpenCode's own generate API, so they use the real endpoint,
 * SDK and credentials — the only check that reflects request time, and the only
 * way to reach credentials held in the auth store rather than the config.
 */
/**
 * `ok` answered · `unusable` the endpoint will not serve it, including a quota
 * that is spent rather than momentarily throttled · `unauthorized` the
 * credential was rejected (not the model's fault, but it still cannot serve
 * traffic) · `inconclusive` a transient throttle, which must never shrink the
 * pool on its own.
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
