import type { AgentName, Candidate, ProbeResult } from "./types";
import { ModelStore } from "./model-store";
import { Config } from "./config";
import { StorageDomain } from "@opencode/plugin/promise/storage";
type CompactModel = Pick<Candidate, "id" | "providerID" | "target">;
export declare class Router {
    private readonly modelStore;
    private readonly config;
    private readonly storage;
    private readonly candidates;
    private readonly pins;
    readonly cachedAssignments: Map<AgentName, CompactModel | undefined>;
    constructor(modelStore: ModelStore, config: Config, storage: StorageDomain);
    init(): Promise<void>;
    getAssignments(probe: (model: Candidate) => Promise<ProbeResult>): Promise<Map<AgentName, CompactModel | undefined>>;
    pin(agent: AgentName, modelTarget: string): void;
    unpin(agent: AgentName): void;
    private choose;
    private probeAndSelect;
    private sort;
    private normalizedLatency;
}
export {};
