import type { DiscoveredModel } from "./types.js";
export declare class HealthStore {
    private readonly state;
    private key;
    merge(models: DiscoveredModel[]): DiscoveredModel[];
    success(model: DiscoveredModel, latencyMs: number): void;
    failure(model: DiscoveredModel, cooldownMs?: number): void;
    isCoolingDown(model: DiscoveredModel): boolean;
    successRate(model: DiscoveredModel): number;
}
