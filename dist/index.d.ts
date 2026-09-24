declare module "src/types" {
    const OMO_AGENT_NAMES: readonly ["sisyphus", "hephaestus", "prometheus", "atlas", "oracle", "librarian", "explore", "multimodal-looker", "metis", "momus", "sisyphus-junior"];
    type OMOAgentName = (typeof OMO_AGENT_NAMES)[number];
    const SLIM_AGENT_NAMES: readonly ["orchestrator", "explorer", "council", "designer", "fixer", "observer"];
    type SlimAgentName = (typeof SLIM_AGENT_NAMES)[number];
    const BASIC_AGENTS: readonly ["coder", "architect", "visual"];
    type BasicAgentName = (typeof BASIC_AGENTS)[number];
    export const AGENT_NAMES: readonly ["sisyphus", "hephaestus", "prometheus", "atlas", "oracle", "librarian", "explore", "multimodal-looker", "metis", "momus", "sisyphus-junior", "orchestrator", "explorer", "council", "designer", "fixer", "observer", "coder", "architect", "visual"];
    export type AgentName = OMOAgentName | SlimAgentName | BasicAgentName;
    export type ModelCategory = "reasoning" | "coding" | "fast" | "vision" | "long-context" | "cheap" | "general";
    export type RoutingStrategy = "priority" | "round-robin" | "weighted" | "latency" | "rate" | "adaptive";
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
        lastSuccessAt?: number;
        lastFailureAt?: number;
        cooldownUntil?: number;
    }
    export interface AgentRequirements {
        categories: ModelCategory[];
        weights: Partial<Record<ModelCategory, number>>;
        minContext?: number;
        vision?: boolean;
        reasoning?: boolean;
        tools?: boolean;
        latencyWeight: number;
        healthWeight: number;
        costWeight: number;
        contextWeight: number;
    }
    export interface Candidate {
        model: DiscoveredModel;
        score: number;
        breakdown: {
            category: number;
            health: number;
            latency: number;
            cost: number;
            context: number;
            capabilities: number;
        };
    }
    export interface RouterConfig {
        refreshMs: number;
        maxFallbacks: number;
        probe: boolean;
        probeTimeoutMs: number;
        strategy: RoutingStrategy;
        minHealth: number;
        log: boolean;
    }
}
declare module "src/agents" {
    import type { AgentName, AgentRequirements } from "src/types";
    export const AGENT_REQUIREMENTS: Record<AgentName, AgentRequirements>;
}
declare module "src/classifier" {
    import type { DiscoveredModel } from "src/types";
    export function classifyModel(model: any): DiscoveredModel;
}
declare module "src/config" {
    import type { RouterConfig } from "src/types";
    export function loadConfig(): RouterConfig;
}
declare module "src/health" {
    import type { DiscoveredModel } from "src/types";
    export class HealthStore {
        private readonly state;
        private key;
        merge(models: DiscoveredModel[]): DiscoveredModel[];
        success(model: DiscoveredModel, latencyMs: number): void;
        failure(model: DiscoveredModel, cooldownMs?: number): void;
        isCoolingDown(model: DiscoveredModel): boolean;
        successRate(model: DiscoveredModel): number;
    }
}
declare module "src/scorer" {
    import type { AgentName, Candidate, DiscoveredModel, AgentRequirements } from "src/types";
    export function findCandidates(agent: AgentName, models: DiscoveredModel[], additionals: Record<string, AgentRequirements>): Candidate[];
}
declare module "src/router" {
    import type { AgentName, Candidate, RoutingStrategy } from "src/types";
    import { HealthStore } from "src/health";
    export class Router {
        private readonly health;
        private readonly cursors;
        constructor(health: HealthStore);
        choose(agent: AgentName, candidates: Candidate[], strategy: RoutingStrategy): Candidate | undefined;
        private roundRobin;
        private weighted;
        private normalizedLatency;
        private adaptive;
    }
}
declare module "src/index" {
    export const OpenCodeAgentRouter: import("@opencode-ai/plugin/promise/plugin").Plugin;
    export default OpenCodeAgentRouter;
}
