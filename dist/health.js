export class HealthStore {
    state = new Map();
    key(model) {
        return `${model.providerID}/${model.id}`;
    }
    merge(models) {
        return models.map((model) => {
            const previous = this.state.get(this.key(model));
            const merged = previous ? {
                ...model,
                health: previous.health,
                latencyMs: previous.latencyMs,
                failures: previous.failures,
                successes: previous.successes,
                lastSuccessAt: previous.lastSuccessAt,
                lastFailureAt: previous.lastFailureAt,
                cooldownUntil: previous.cooldownUntil,
            } : model;
            this.state.set(this.key(model), merged);
            return merged;
        });
    }
    success(model, latencyMs) {
        const current = this.state.get(this.key(model));
        if (!current)
            return;
        current.successes++;
        current.lastSuccessAt = Date.now();
        current.latencyMs = Number.isFinite(current.latencyMs)
            ? current.latencyMs * 0.8 + latencyMs * 0.2
            : latencyMs;
        current.health = Math.min(1, current.health * 0.8 + 1 * 0.2);
        current.cooldownUntil = undefined;
    }
    failure(model, cooldownMs = 30_000) {
        const current = this.state.get(this.key(model));
        if (!current)
            return;
        current.failures++;
        current.lastFailureAt = Date.now();
        current.health = Math.max(0, current.health * 0.7);
        current.cooldownUntil = Date.now() + cooldownMs;
    }
    isCoolingDown(model) {
        return Boolean(model.cooldownUntil && model.cooldownUntil > Date.now());
    }
    successRate(model) {
        const total = model.successes + model.failures;
        return total === 0 ? 0.5 : model.successes / total;
    }
}
