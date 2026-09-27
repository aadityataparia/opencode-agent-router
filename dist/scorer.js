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
const defaultReq = {
    weights: {
        cheap: 0.4,
        fast: 0.4,
        general: 0.1,
    },
    latencyWeight: 1,
    costWeight: 1,
    contextWeight: 0.7,
};
export function findCandidates(agent, models, additionals, minHeadlth = 0) {
    const req = {
        ...defaultReq,
        ...(AGENT_REQUIREMENTS[agent] ?? additionals[agent]),
    };
    return models
        .filter((model) => model.health > minHeadlth && satisfies(model, req))
        .map((model) => {
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
            ((model.releasedAt ?? Date.now()) / Date.now()) * 0.2 +
            0.1 * breakdown.capabilities;
        return { model, score, breakdown };
    })
        .sort((a, b) => b.score - a.score);
}
