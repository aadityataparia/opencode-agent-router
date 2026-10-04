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
    let latency = model.latencyMs;
    if (!Number.isFinite(model.latencyMs))
        latency = 5000;
    return 1 / (1 + (latency - (model.categories.has("fast") ? 500 : 0)) / 5_000);
}
function costScore(model) {
    const input = ((model.cost.input ?? 0) * 2 + (model.cost.output ?? 0)) / 20;
    return 1 / (1 + Math.max(0, input));
}
function contextScore(model, req) {
    if (!req.minContext) {
        return model.categories.has("long-context") ? 1 : 0.5;
    }
    return Math.min(model.context / req.minContext, 2) / 2;
}
function categoryScore(model, req) {
    let score = 0;
    let maxWeight = 0;
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
    // One check today. An agent that does not state a preference is never
    // penalised for it, which is what the empty-result case meant.
    if (req.tools == null)
        return 1;
    return model.capabilities.tools === req.tools ? 1 : 0;
}
const DEFAULT_AGENT_REQ = {
    weights: {
        "long-context": 0.5,
        reasoning: 0.5,
        fast: 0.5,
        cheap: 0.5,
    },
};
const scoreRecency = (model) => {
    const years = model.releasedAt
        ? (Date.now() - model.releasedAt) / (365 * 24 * 60 * 60 * 1000)
        : 0;
    return 1 - years / 10;
};
export const scoreModel = (model, passed = DEFAULT_AGENT_REQ) => {
    const req = { ...DEFAULT_AGENT_REQ, ...passed };
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
export function findCandidates(req, models) {
    return models
        .filter((model) => satisfies(model, req))
        .map((model) => {
        return {
            id: model.id,
            providerID: model.providerID,
            target: model.target,
            ...scoreModel(model, req),
        };
    })
        .sort((a, b) => b.score - a.score);
}
