import type { DiscoveredModel, ProbeResult } from "./types.ts";
import { StorageDomain } from "@opencode/plugin/promise/storage";
import { ModelInfo } from "@opencode/client";
import { Config } from "./config.js";
export declare class ModelStore {
    private readonly storage;
    private readonly config;
    private readonly state;
    constructor(storage: StorageDomain, config: Config);
    setCatalog(catalog: ModelInfo[]): Promise<void>;
    getModel(target: string): DiscoveredModel | undefined;
    setModel(model: DiscoveredModel): void;
    getAllModels(): DiscoveredModel[];
    private success;
    private failure;
    private isCoolingDown;
    /** True when a probe result is stale enough to re-spend a request on; never-probed models always are. */
    needsProbe(target: string): boolean;
    /** A ping is scored exactly like a real request, so the router learns from one signal. */
    recordProbe(target: string, result: ProbeResult, cooldownMs: number): void;
}
