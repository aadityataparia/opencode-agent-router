import type { AgentName, Candidate, RoutingStrategy } from "./types.js";
import { HealthStore } from "./health.js";
export declare class Router {
    private readonly health;
    private readonly cursors;
    constructor(health: HealthStore);
    choose(agent: AgentName, candidates: Candidate[], strategy: RoutingStrategy): Candidate | undefined;
    private roundRobin;
    private weighted;
    private normalizedLatency;
    private adaptive;
}
