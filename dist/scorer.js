import { AGENT_REQUIREMENTS } from "./agents";
import { MODEL_CATEGORIES, } from "./types";
function satisfies(model, req) {
    if (req.minContext && model.context < req.minContext)
        return false;
    if (req.vision && !model.capabilities.vision)
        return false;
    if (req.reasoning && !model.capabilities.reasoning)
        return false;
    if (req.tools && !model.capabilities.tools)
        return false;
    return true;
}
function categoryScore(model, req) {
    let score = 0;
    let maxWeight = 0;
    for (const [category, weight] of Object.entries(req.weights)) {
        if (!MODEL_CATEGORIES.includes(category))
            continue;
        if (model.categories.has(category))
            score += weight;
        maxWeight += weight;
    }
    return maxWeight === 0 ? 0 : score / maxWeight;
}
function latencyScore(model) {
    if (!Number.isFinite(model.latencyMs))
        return 0.5;
    return 1 / (1 + model.latencyMs / 1000);
}
function costScore(model) {
    const input = (model.cost.input ?? 0) * 2 + (model.cost.output ?? 0);
    return 1 / (1 + Math.max(0, input));
}
function contextScore(model, req) {
    if (!req.minContext)
        return 1;
    return Math.min(model.context / req.minContext, 2) / 2;
}
function capabilityScore(model, req) {
    const checks = [
        req.vision == null ? null : model.capabilities.vision === req.vision,
        req.reasoning == null
            ? null
            : model.capabilities.reasoning === req.reasoning,
        req.tools == null ? null : model.capabilities.tools === req.tools,
    ].filter((x) => x !== null);
    return checks.length === 0
        ? 1
        : checks.filter(Boolean).length / checks.length;
}
export const DEFAULT_AGENT_REQ = {
    weights: {
        "long-context": 0.5,
        reasoning: 0.5,
        fast: 0.5,
        cheap: 0.5,
    },
    latencyWeight: 0.1,
    costWeight: 0.5,
    contextWeight: 0.5,
};
const yearsFromNow = (time = Date.now()) => {
    return (Date.now() - time) / (365 * 24 * 60 * 60 * 1000);
};
export const getAgentRequirements = (agent, additionals = {}) => {
    return {
        ...DEFAULT_AGENT_REQ,
        ...(AGENT_REQUIREMENTS[agent] ?? additionals[agent]),
    };
};
export const scoreModel = (model, req = DEFAULT_AGENT_REQ) => {
    const breakdown = {
        category: categoryScore(model, req),
        health: model.health,
        latency: latencyScore(model),
        cost: costScore(model),
        context: contextScore(model, req),
        capabilities: capabilityScore(model, req),
    };
    const score = breakdown.category +
        req.latencyWeight * breakdown.latency +
        req.costWeight * breakdown.cost +
        req.contextWeight * breakdown.context +
        yearsFromNow(model.releasedAt) * 0.2 +
        0.1 * breakdown.capabilities;
    return { score, breakdown };
};
export function findCandidates(agent, models, additionals, minHeadlth = 0) {
    const req = getAgentRequirements(agent, additionals);
    return models
        .filter((model) => model.health > minHeadlth && satisfies(model, req))
        .map((model) => {
        return { model, ...scoreModel(model, req) };
    })
        .sort((a, b) => b.score - a.score);
}
