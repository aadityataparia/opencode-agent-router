import { classifyModel } from "./classifier.js";
const MODEL_STATE_KEY = "model-router:model-state:";
export class ModelStore {
    storage;
    config;
    state = new Map();
    constructor(storage, config) {
        this.storage = storage;
        this.config = config;
    }
    async setCatalog(catalog) {
        for (const model of catalog) {
            if (this.config.current.ignoredProviders.includes(model.providerID)) {
                continue;
            }
            const classified = classifyModel(model);
            const previous = (await this.storage.get(MODEL_STATE_KEY + classified.target));
            const merged = previous
                ? {
                    ...classified,
                    health: previous.health,
                    latencyMs: previous.latencyMs,
                    failures: previous.failures,
                    successes: previous.successes,
                    lastSuccessAt: previous.lastSuccessAt,
                    lastFailureAt: previous.lastFailureAt,
                    cooldownUntil: previous.cooldownUntil,
                    lastProbeAt: previous.lastProbeAt,
                    lastProbeResult: previous.lastProbeResult,
                }
                : classified;
            this.setModel(merged);
        }
    }
    getModel(target) {
        return this.state.get(target);
    }
    setModel(model) {
        void this.storage.set(MODEL_STATE_KEY + model.target, model);
        this.state.set(model.target, model);
    }
    getAllModels(filter) {
        let models = Array.from(this.state.values());
        if (filter) {
            models = models.filter((model) => model.target.includes(filter));
        }
        return models;
    }
    success(model, latencyMs) {
        const current = this.state.get(model.target);
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
        current.lastProbeResult = true;
        this.setModel(current);
    }
    failure(model, cooldownMs = 30_000) {
        const current = this.state.get(model.target);
        if (!current)
            return;
        current.failures++;
        current.lastFailureAt = Date.now();
        current.health = current.successes / (current.successes + current.failures);
        current.cooldownUntil = Date.now() + cooldownMs;
        current.lastProbeResult = false;
        this.setModel(current);
    }
    isCoolingDown(model) {
        return Boolean(model.cooldownUntil && model.cooldownUntil > Date.now());
    }
    /** True when a probe result is stale enough to re-spend a request on; never-probed models always are. */
    needsProbe(target) {
        const current = this.state.get(target);
        if (!current?.lastProbeAt)
            return true;
        return (Date.now() - current.lastProbeAt >= this.config.current.refreshMs &&
            !this.isCoolingDown(current));
    }
    /** A ping is scored exactly like a real request, so the router learns from one signal. */
    recordProbe(target, result, cooldownMs) {
        const current = this.state.get(target);
        if (!current)
            return;
        current.lastProbeAt = Date.now();
        if (result.verdict === "ok") {
            this.success(current, result.latencyMs);
        }
        else {
            this.failure(current, cooldownMs);
        }
    }
}
