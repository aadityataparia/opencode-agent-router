export class Router {
    health;
    cursors = new Map();
    constructor(health) {
        this.health = health;
    }
    choose(agent, candidates, strategy) {
        if (candidates.length === 0)
            return undefined;
        switch (strategy) {
            case "round-robin":
                return this.roundRobin(agent, candidates);
            case "weighted":
                return this.weighted(candidates);
            case "latency":
                return [...candidates].sort((a, b) => this.normalizedLatency(a) - this.normalizedLatency(b))[0];
            case "rate":
                return [...candidates].sort((a, b) => this.health.successRate(b.model) - this.health.successRate(a.model))[0];
            case "priority":
                return candidates[0];
            case "adaptive":
            default:
                return this.adaptive(candidates);
        }
    }
    roundRobin(agent, candidates) {
        const cursor = this.cursors.get(agent) ?? 0;
        const candidate = candidates[cursor % candidates.length];
        this.cursors.set(agent, cursor + 1);
        return candidate;
    }
    weighted(candidates) {
        const weights = candidates.map((candidate) => Math.max(0.01, candidate.score));
        const total = weights.reduce((a, b) => a + b, 0);
        let pick = Math.random() * total;
        for (let i = 0; i < candidates.length; i++) {
            pick -= weights[i];
            if (pick <= 0)
                return candidates[i];
        }
        return candidates.at(-1);
    }
    normalizedLatency(candidate) {
        return Number.isFinite(candidate.model.latencyMs)
            ? candidate.model.latencyMs
            : Number.MAX_SAFE_INTEGER;
    }
    adaptive(candidates) {
        return [...candidates].sort((a, b) => {
            const aRate = this.health.successRate(a.model);
            const bRate = this.health.successRate(b.model);
            const aLatency = this.normalizedLatency(a);
            const bLatency = this.normalizedLatency(b);
            const aValue = a.score + aRate * 0.25 - Math.min(aLatency / 10_000, 1) * 0.15;
            const bValue = b.score + bRate * 0.25 - Math.min(bLatency / 10_000, 1) * 0.15;
            return bValue - aValue;
        })[0];
    }
}
