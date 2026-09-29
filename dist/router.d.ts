import type { AgentName, Candidate, RoutingStrategy } from "./types";
export declare class Router {
    private readonly cursors;
    choose(agent: AgentName, candidates: Candidate[], strategy: RoutingStrategy): Candidate | undefined;
    private roundRobin;
    private weighted;
    private normalizedLatency;
}
