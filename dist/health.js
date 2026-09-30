export class HealthStore {
    state = new Map();
    key(model) {
        return model.target;
    }
    merge(models) {
        return models.map((model) => {
            const previous = this.state.get(this.key(model));
            const merged = previous
                ? {
                    ...model,
                    health: previous.health,
                    latencyMs: previous.latencyMs,
                    failures: previous.failures,
                    successes: previous.successes,
                    lastSuccessAt: previous.lastSuccessAt,
                    lastFailureAt: previous.lastFailureAt,
                    cooldownUntil: previous.cooldownUntil,
                    lastProbeAt: previous.lastProbeAt,
                }
                : model;
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
            ? (current.latencyMs * (current.successes - 1) + latencyMs) /
                current.successes
            : latencyMs;
        current.health = current.successes / (current.successes + current.failures);
        current.cooldownUntil = undefined;
    }
    failure(model, cooldownMs = 30_000) {
        const current = this.state.get(this.key(model));
        if (!current)
            return;
        current.failures++;
        current.lastFailureAt = Date.now();
        current.health = current.successes / (current.successes + current.failures);
        current.cooldownUntil = Date.now() + cooldownMs;
    }
    isCoolingDown(model) {
        return Boolean(model.cooldownUntil && model.cooldownUntil > Date.now());
    }
    /** True when a probe result is stale enough to re-spend a request on; never-probed models always are. */
    needsProbe(model, ttlMs) {
        const current = this.state.get(this.key(model));
        if (!current?.lastProbeAt)
            return true;
        return Date.now() - current.lastProbeAt >= ttlMs;
    }
    /** A ping is scored exactly like a real request, so the router learns from one signal. */
    recordProbe(model, result, cooldownMs) {
        const current = this.state.get(this.key(model));
        if (!current)
            return;
        current.lastProbeAt = Date.now();
        if (result.ok) {
            this.success(model, result.latencyMs);
        }
        else {
            this.failure(model, cooldownMs);
        }
    }
}
