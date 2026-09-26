import type { DiscoveredModel } from "./types.ts";
export declare class HealthStore {
    private readonly state;
    private key;
    merge(models: DiscoveredModel[]): DiscoveredModel[];
    success(model: DiscoveredModel, latencyMs: number): void;
    failure(model: DiscoveredModel, cooldownMs?: number): void;
    isCoolingDown(model: DiscoveredModel): boolean;
    /** True when a probe result is stale enough to re-spend a request on; never-probed models always are. */
    needsProbe(model: DiscoveredModel, ttlMs: number): boolean;
    /** A ping is scored exactly like a real request, so the router learns from one signal. */
    recordProbe(model: DiscoveredModel, result: {
        ok: boolean;
        latencyMs: number;
    }, cooldownMs: number): void;
    successRate(model: DiscoveredModel): number;
}
