import { AGENT_REQUIREMENTS } from "./agents";
import { MODEL_CATEGORIES, } from "./types";
export function satisfies(model, req) {
    if (req.minContext && model.context < req.minContext)
        return false;
    if ((req.weights.vision ?? 0) > 0 && !model.capabilities.vision)
        return false;
    if ((req.weights.reasoning ?? 0) > 0 && !model.capabilities.reasoning)
        return false;
    if (req.tools && !model.capabilities.tools)
        return false;
    return true;
}
function latencyScore(model) {
    if (!Number.isFinite(model.latencyMs))
        return 0.5;
    return (1 / (1 + model.latencyMs / 5_000) +
        (model.categories.has("fast") ? 0.25 : 0));
}
function costScore(model) {
    const input = ((model.cost.input ?? 0) * 2 + (model.cost.output ?? 0)) / 10;
    return 1 / (1 + Math.max(0, input));
}
function contextScore(model, req) {
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
function categoryScore(model, req) {
    let score = 0;
    let maxWeight = 0;
    // general fallback
    req.weights.general = req.weights.general ?? 0.1;
    for (const [category, weight] of Object.entries(req.weights)) {
        if (!MODEL_CATEGORIES.includes(category))
            continue;
        let value;
        switch (category) {
            case "fast":
                value = latencyScore(model);
                break;
            case "cheap":
                value = costScore(model);
                break;
            case "long-context":
                value = contextScore(model, req);
                break;
            case "reasoning":
                value = model.categories.has("fast") ? 0.5 : 1;
                break;
            default:
                value = model.categories.has(category) ? 1 : 0;
        }
        score += weight * value;
        maxWeight += weight;
    }
    return maxWeight === 0 ? 0 : score / maxWeight;
}
function capabilityScore(model, req) {
    const checks = [
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
};
export const scoreRecency = (model) => {
    const years = model.releasedAt
        ? (Date.now() - model.releasedAt) / (365 * 24 * 60 * 60 * 1000)
        : 0;
    return 1 - years / 10;
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
        recency: scoreRecency(model),
    };
    // Latency, cost and context already sit inside `breakdown.category` via the
    // fast / cheap / long-context weights, so adding them again would count them
    // twice and let them outweigh the categories they are meant to inform.
    const score = breakdown.category + breakdown.recency * 0.1 + breakdown.capabilities * 0.1;
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
