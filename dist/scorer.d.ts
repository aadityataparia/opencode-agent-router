import { type Candidate, type DiscoveredModel, type AgentRequirements } from "./types";
export declare function satisfies(model: DiscoveredModel, req: AgentRequirements): boolean;
export declare const scoreModel: (model: DiscoveredModel, passed?: AgentRequirements) => {
    score: number;
    breakdown: Candidate["breakdown"];
};
export declare function findCandidates(req: AgentRequirements, models: DiscoveredModel[]): Candidate[];
