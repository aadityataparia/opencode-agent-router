import { type AgentName, type Candidate, type ProbeResult } from "./types";
import { ModelStore } from "./model-store";
import { Config } from "./config";
import { StorageDomain } from "@opencode/plugin/promise/storage";
import { Context } from "@opencode/plugin/promise/plugin";
type CompactModel = Pick<Candidate, "id" | "providerID" | "target">;
export declare class Router {
    private readonly modelStore;
    private readonly config;
    private readonly storage;
    readonly probe: (model: Pick<Candidate, "id" | "providerID">) => Promise<ProbeResult>;
    private readonly ctxAgent;
    readonly candidates: Map<AgentName, Candidate[]>;
    readonly pins: Map<AgentName, string>;
    readonly cachedAssignments: Map<AgentName, CompactModel | undefined>;
    readonly discovered: number;
    constructor(modelStore: ModelStore, config: Config, storage: StorageDomain, probe: (model: Pick<Candidate, "id" | "providerID">) => Promise<ProbeResult>, ctxAgent: Context["agent"]);
    init(): Promise<void>;
    private getAssignments;
    pin(agent: AgentName, modelTarget: string): void;
    unpin(agent: AgentName): void;
    assignModels(): Promise<{
        dispose: () => void;
    }>;
    private choose;
    private probeAndSelect;
    private sort;
    private normalizedLatency;
}
export {};
