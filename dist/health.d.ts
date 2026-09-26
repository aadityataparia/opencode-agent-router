import type { DiscoveredModel } from "./types.ts";
export declare class HealthStore {
    private readonly state;
    private key;
    merge(models: DiscoveredModel[]): DiscoveredModel[];
    success(model: DiscoveredModel, latencyMs: number): void;
    failure(model: DiscoveredModel, cooldownMs?: number): void;
    isCoolingDown(model: DiscoveredModel): boolean;
    /**
     * True when a probe result is stale enough to be worth spending a request on.
     * Never-probed models always need one.
     */
    needsProbe(model: DiscoveredModel, ttlMs: number): boolean;
    /**
     * Folds a probe outcome into health. A ping is scored exactly like a real
     * request so the router learns from one signal, not two.
     */
    recordProbe(model: DiscoveredModel, result: {
        ok: boolean;
        latencyMs: number;
    }, cooldownMs: number): void;
    successRate(model: DiscoveredModel): number;
}
