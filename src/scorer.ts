import { AGENT_REQUIREMENTS } from "./agents";
import {
  type AgentName,
  type Candidate,
  type DiscoveredModel,
  type AgentRequirements,
  type ModelCategory,
  MODEL_CATEGORIES,
} from "./types";

function satisfies(model: DiscoveredModel, req: AgentRequirements): boolean {
  if (req.minContext && model.context < req.minContext) return false;
  if ((req.weights.vision ?? 0) > 0 && !model.capabilities.vision) return false;
  if ((req.weights.reasoning ?? 0) > 0 && !model.capabilities.reasoning)
    return false;
  if (req.tools && !model.capabilities.tools) return false;
  return true;
}

function latencyScore(model: DiscoveredModel): number {
  if (!Number.isFinite(model.latencyMs)) return 0.5;
  return 1 / (1 + model.latencyMs / 1000);
}

function costScore(model: DiscoveredModel): number {
  const input = (model.cost.input ?? 0) * 2 + (model.cost.output ?? 0);
  return 1 / (1 + Math.max(0, input));
}

function contextScore(model: DiscoveredModel, req: AgentRequirements): number {
  if (!req.minContext) {
    // No bar to measure against, so fall back to the tag rather than grading
    // every model identically.
    return model.categories.has("long-context") ? 1 : 0.5;
  }
  return Math.min(model.context / req.minContext, 2) / 2;
}

/**
 * Three categories are measured signals rather than model tags: they score the
 * model continuously instead of asking whether it carries the tag. A model
 * labelled `fast` is not necessarily fast, so the tag is the weaker signal and
 * the measurement wins.
 */
function categoryScore(model: DiscoveredModel, req: AgentRequirements): number {
  let score = 0;
  let maxWeight = 0;
  // general fallback
  req.weights.general = req.weights.general ?? 0.1;

  for (const [category, weight] of Object.entries(req.weights)) {
    if (!MODEL_CATEGORIES.includes(category as ModelCategory)) continue;
    let value: number;
    switch (category as ModelCategory) {
      case "fast":
        value = latencyScore(model);
        break;
      case "cheap":
        value = costScore(model);
        break;
      case "long-context":
        value = contextScore(model, req);
        break;
      default:
        value = model.categories.has(category as ModelCategory) ? 1 : 0;
    }
    score += weight * value;
    maxWeight += weight;
  }
  return maxWeight === 0 ? 0 : score / maxWeight;
}

function capabilityScore(
  model: DiscoveredModel,
  req: AgentRequirements,
): number {
  const checks = [
    req.tools == null ? null : model.capabilities.tools === req.tools,
  ].filter((x): x is boolean => x !== null);

  return checks.length === 0
    ? 1
    : checks.filter(Boolean).length / checks.length;
}

export const DEFAULT_AGENT_REQ: AgentRequirements = {
  weights: {
    "long-context": 0.5,
    reasoning: 0.5,
    fast: 0.5,
    cheap: 0.5,
  },
};

const yearsFromNow = (time: number = Date.now()): number => {
  return (Date.now() - time) / (365 * 24 * 60 * 60 * 1000);
};

export const getAgentRequirements = (
  agent: AgentName,
  additionals: Record<string, AgentRequirements> = {},
): AgentRequirements => {
  return {
    ...DEFAULT_AGENT_REQ,
    ...(AGENT_REQUIREMENTS[agent] ?? additionals[agent]),
  };
};

export const scoreModel = (
  model: DiscoveredModel,
  req: AgentRequirements = DEFAULT_AGENT_REQ,
): { score: number; breakdown: Candidate["breakdown"] } => {
  const breakdown = {
    category: categoryScore(model, req),
    health: model.health,
    latency: latencyScore(model),
    cost: costScore(model),
    context: contextScore(model, req),
    capabilities: capabilityScore(model, req),
  };

  // Latency, cost and context already sit inside `breakdown.category` via the
  // fast / cheap / long-context weights, so adding them again would count them
  // twice and let them outweigh the categories they are meant to inform.
  const score =
    breakdown.category +
    yearsFromNow(model.releasedAt) * 0.2 +
    0.1 * breakdown.capabilities;
  return { score, breakdown };
};

export function findCandidates(
  agent: AgentName,
  models: DiscoveredModel[],
  additionals: Record<string, AgentRequirements>,
  minHeadlth: number = 0,
): Candidate[] {
  const req = getAgentRequirements(agent, additionals);

  return models
    .filter((model) => model.health > minHeadlth && satisfies(model, req))
    .map((model) => {
      return { model, ...scoreModel(model, req) };
    })
    .sort((a, b) => b.score - a.score);
}
