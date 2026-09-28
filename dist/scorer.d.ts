import { type AgentName, type Candidate, type DiscoveredModel, type AgentRequirements } from "./types";
export declare function satisfies(model: DiscoveredModel, req: AgentRequirements): boolean;
export declare const DEFAULT_AGENT_REQ: AgentRequirements;
export declare const scoreRecency: (model: DiscoveredModel) => number;
export declare const getAgentRequirements: (agent: AgentName, additionals?: Record<string, AgentRequirements>) => AgentRequirements;
export declare const scoreModel: (model: DiscoveredModel, req?: AgentRequirements) => {
    score: number;
    breakdown: Candidate["breakdown"];
};
export declare function findCandidates(agent: AgentName, models: DiscoveredModel[], additionals: Record<string, AgentRequirements>, minHeadlth?: number): Candidate[];
