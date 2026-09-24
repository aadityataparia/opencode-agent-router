import type { AgentName, Candidate, DiscoveredModel, AgentRequirements } from "./types.js";
export declare function findCandidates(agent: AgentName, models: DiscoveredModel[], additionals: Record<string, AgentRequirements>): Candidate[];
