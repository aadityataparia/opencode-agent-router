import { findCandidates } from "./scorer";
const PIN_KEY = "model-router:pins";
const ASSIGNMENT_KEY = "model-router:assignments";
export class Router {
    modelStore;
    config;
    storage;
    candidates = new Map();
    pins = new Map();
    cachedAssignments = new Map();
    constructor(modelStore, config, storage) {
        this.modelStore = modelStore;
        this.config = config;
        this.storage = storage;
        for (const agent of Object.keys(config.current.agents)) {
            this.candidates.set(agent, this.sort(findCandidates(this.config.current.agents[agent], this.modelStore.getAllModels()), this.config.current.strategy));
        }
    }
    async init() {
        const storedPins = (await this.storage.get(PIN_KEY));
        if (storedPins) {
            for (const [agent, target] of Object.entries(storedPins)) {
                this.pins.set(agent, target);
            }
        }
        const storedAssignments = (await this.storage.get(ASSIGNMENT_KEY));
        if (storedAssignments) {
            for (const [agent, model] of Object.entries(storedAssignments)) {
                this.cachedAssignments.set(agent, model);
            }
        }
    }
    async getAssignments(probe) {
        for (const agent of Object.keys(this.config.current.agents)) {
            // just probe if we already have model, to avoid changing models all the time
            if (this.cachedAssignments.has(agent) &&
                ["cost", "adaptive"].includes(this.config.current.strategy)) {
                const probeResult = await probe(this.cachedAssignments.get(agent));
                if (probeResult.verdict === "ok") {
                    continue;
                }
            }
            const result = await this.choose(agent, probe);
            this.cachedAssignments.set(agent, result ?? this.candidates.get(agent)?.[0]);
        }
        return this.cachedAssignments;
    }
    pin(agent, modelTarget) {
        this.pins.set(agent, modelTarget);
    }
    unpin(agent) {
        this.pins.delete(agent);
    }
    async choose(agent, probe) {
        if (!this.config.current.agents[agent])
            return undefined;
        const candidates = this.sort(this.candidates.get(agent) || [], this.config.current.strategy);
        if (candidates.length === 0)
            return undefined;
        if (this.pins.has(agent)) {
            const pinnedTarget = this.pins.get(agent);
            const pinnedCandidate = this.modelStore.getModel(pinnedTarget);
            if (pinnedCandidate) {
                return pinnedCandidate;
            }
        }
        return this.probeAndSelect(agent, probe);
    }
    async probeAndSelect(agent, probe) {
        const candidates = this.candidates.get(agent);
        if (!candidates || candidates.length === 0)
            return undefined;
        for (const candidate of candidates) {
            if (this.modelStore.needsProbe(candidate.target)) {
                const result = await probe(candidate);
                this.modelStore.recordProbe(candidate.target, result, 60 * 1000); // 1 minute cooldown for probe results
                if (result.verdict === "ok") {
                    return candidate;
                }
            }
            else if (this.modelStore.getModel(candidate.target)?.lastProbeResult) {
                return candidate;
            }
        }
        return undefined;
    }
    sort(candidates, strategy) {
        if (candidates.length === 0)
            return [];
        switch (strategy) {
            case "round-robin":
                return candidates.toSorted(() => Math.random() - 0.5);
            case "latency":
                return candidates.toSorted((a, b) => this.normalizedLatency(a) - this.normalizedLatency(b));
            case "cost":
                return candidates.toSorted((a, b) => b.breakdown.cost - a.breakdown.cost);
            case "adaptive":
            default:
                return candidates.toSorted((a, b) => b.score - a.score);
        }
    }
    normalizedLatency(candidate) {
        const model = this.modelStore.getModel(candidate.target);
        if (!model)
            return Number.MAX_SAFE_INTEGER;
        return Number.isFinite(model.latencyMs)
            ? model.latencyMs
            : Number.MAX_SAFE_INTEGER;
    }
}
