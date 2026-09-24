const OMO_AGENT_NAMES = [
  "sisyphus",
  "hephaestus",
  "prometheus",
  "atlas",
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "metis",
  "momus",
  "sisyphus-junior",
] as const;

type OMOAgentName = (typeof OMO_AGENT_NAMES)[number];

const SLIM_AGENT_NAMES = [
  "orchestrator",
  "explorer",
  // "oracle",
  "council",
  // "librarian",
  "designer",
  "fixer",
  "observer",
] as const;

type SlimAgentName = (typeof SLIM_AGENT_NAMES)[number];

const BASIC_AGENTS = ["coder", "architect", "visual"] as const;

type BasicAgentName = (typeof BASIC_AGENTS)[number];

export const AGENT_NAMES = [
  ...OMO_AGENT_NAMES,
  ...SLIM_AGENT_NAMES,
  ...BASIC_AGENTS,
] as const;

export type AgentName = OMOAgentName | SlimAgentName | BasicAgentName;

export type ModelCategory =
  | "reasoning"
  | "coding"
  | "fast"
  | "vision"
  | "long-context"
  | "cheap"
  | "general";

export type RoutingStrategy =
  | "priority"
  | "round-robin"
  | "weighted"
  | "latency"
  | "rate"
  | "adaptive";

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
