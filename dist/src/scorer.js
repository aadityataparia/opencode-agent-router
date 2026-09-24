import { AGENT_REQUIREMENTS } from "./agents.js";
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
    for (const category of req.categories) {
        if (model.categories.has(category))
            score += req.weights[category] ?? 0;
    }
    return score;
}
function latencyScore(model) {
    if (!Number.isFinite(model.latencyMs))
        return 0.5;
    return 1 / (1 + model.latencyMs / 1000);
}
function costScore(model) {
    const input = model.cost.input;
    if (typeof input !== "number")
        return 0.5;
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
    categories: ["fast", "cheap", "general"],
    weights: {
        cheap: 1,
        fast: 1,
        general: 0.5,
    },
    latencyWeight: 1,
    healthWeight: 1,
    costWeight: 1,
    contextWeight: 0.7,
};
export function findCandidates(agent, models, additionals) {
    const req = {
        ...defaultReq,
        ...(AGENT_REQUIREMENTS[agent] ?? additionals[agent]),
    };
    return models
        .filter((model) => model.health > 0 && satisfies(model, req))
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
            req.healthWeight * breakdown.health +
            req.latencyWeight * breakdown.latency +
            req.costWeight * breakdown.cost +
            req.contextWeight * breakdown.context +
            0.1 * breakdown.capabilities;
        return { model, score, breakdown };
    })
        .sort((a, b) => b.score - a.score);
}
