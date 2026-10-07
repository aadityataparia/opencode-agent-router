export declare const PRESET_NAMES: readonly ["oh-my-opencode", "oh-my-openagent", "oh-my-opencode-slim"];
export type PresetName = (typeof PRESET_NAMES)[number];
/**
 * Agent id prefix the router owns; each role's `model` is kept pointed at
 * whichever real model wins routing.
 */
export declare const ROUTER_AGENT_PREFIX = "model-router/";
/** The router-owned agent id for a managed role. */
export declare function routerAgentID(agent: string): string;
declare const OMO_AGENT_NAMES: readonly ["sisyphus", "hephaestus", "prometheus", "atlas", "oracle", "librarian", "explore", "multimodal-looker", "metis", "momus", "sisyphus-junior"];
type OMOAgentName = (typeof OMO_AGENT_NAMES)[number];
declare const SLIM_AGENT_NAMES: readonly ["orchestrator", "explorer", "oracle", "council", "councillor", "librarian", "designer", "fixer", "observer"];
type SlimAgentName = (typeof SLIM_AGENT_NAMES)[number];
declare const BASIC_AGENTS: readonly ["coder", "architect", "visual"];
type BasicAgentName = (typeof BASIC_AGENTS)[number];
export declare const AGENT_NAMES: readonly ["sisyphus", "hephaestus", "prometheus", "atlas", "oracle", "librarian", "explore", "multimodal-looker", "metis", "momus", "sisyphus-junior", "orchestrator", "explorer", "oracle", "council", "councillor", "librarian", "designer", "fixer", "observer", "coder", "architect", "visual"];
export type AgentName = OMOAgentName | SlimAgentName | BasicAgentName;
export declare const MODEL_CATEGORIES: readonly ["reasoning", "coding", "fast", "vision", "long-context", "cheap", "general"];
export type ModelCategory = (typeof MODEL_CATEGORIES)[number];
export declare const STRATEGY_NAMES: readonly ["adaptive", "latency", "cost", "round-robin"];
export type RoutingStrategy = (typeof STRATEGY_NAMES)[number];
export interface ModelCapabilities {
    reasoning: boolean;
    vision: boolean;
    tools: boolean;
}
export interface ModelCost {
    input?: number;
    output?: number;
}
export interface DiscoveredModel {
    providerID: string;
    id: string;
    /** Catalog modelID; may differ from `id` for some providers. */
    modelID?: string;
    target: string;
    name?: string;
    family?: string;
    context: number;
    outputLimit: number;
    capabilities: ModelCapabilities;
    cost: ModelCost;
    categories: Set<ModelCategory>;
    health: number;
    latencyMs: number;
    failures: number;
    successes: number;
    lastProbeResult: boolean;
    lastSuccessAt?: number;
    lastFailureAt?: number;
    cooldownUntil?: number;
    /** When this model was last pinged; drives the probe re-check interval. */
    lastProbeAt?: number;
    releasedAt?: number;
}
export interface AgentRequirements {
    weights: Partial<Record<ModelCategory, number>>;
    minContext?: number;
    tools?: boolean;
}
export interface Candidate {
    id: string;
    providerID: string;
    target: string;
    score: number;
    breakdown: {
        category: number;
        health: number;
        latency: number;
        cost: number;
        context: number;
        capabilities: number;
        recency: number;
    };
}
export interface RouterConfig {
    refreshMs: number;
    probeTimeoutMs: number;
    strategy: RoutingStrategy;
    /** Agent presets to route for; empty means auto-detect at startup. */
    presets: PresetName[];
    /** Requirement overrides for agents declared in the plugin options; routed regardless of preset. */
    agents: Record<string, AgentRequirements>;
    ignoredProviders: string[];
}
declare global {
    interface Request {
        startTime?: number;
    }
}
export type ProbeVerdict = "ok" | "unusable" | "unauthorized" | "inconclusive";
export interface ProbeResult {
    readonly verdict: ProbeVerdict;
    readonly latencyMs: number;
    readonly reply?: string;
    readonly status?: number;
    readonly error?: string;
}
export type CompactModel = Pick<Candidate, "id" | "providerID" | "target">;
export {};
