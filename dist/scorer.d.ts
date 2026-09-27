import { type AgentName, type Candidate, type DiscoveredModel, type AgentRequirements } from "./types";
export declare function findCandidates(agent: AgentName, models: DiscoveredModel[], additionals: Record<string, AgentRequirements>, minHeadlth?: number): Candidate[];
