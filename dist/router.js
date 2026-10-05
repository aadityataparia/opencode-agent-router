import { routerAgentID, } from "./types";
import { findCandidates } from "./scorer";
import { Agent, Model, Provider } from "@opencode/plugin";
import { logger } from "./logger";
const PIN_KEY = "model-router:pins";
const ASSIGNMENT_KEY = "model-router:assignments";
export class Router {
    modelStore;
    config;
    storage;
    probe;
    ctxAgent;
    candidates = new Map();
    pins = new Map();
    cachedAssignments = new Map();
    discovered;
    constructor(modelStore, config, storage, probe, ctxAgent) {
        this.modelStore = modelStore;
        this.config = config;
        this.storage = storage;
        this.probe = probe;
        this.ctxAgent = ctxAgent;
        const allModels = modelStore.getAllModels();
        this.discovered = allModels.length;
        for (const agent of Object.keys(config.current.agents)) {
            this.candidates.set(agent, this.sort(findCandidates(this.config.current.agents[agent], allModels), this.config.current.strategy));
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
    async getAssignments() {
        for (const agent of Object.keys(this.config.current.agents)) {
            // just probe if we already have model, to avoid changing models all the time
            if (this.cachedAssignments.has(agent) &&
                ["cost", "adaptive"].includes(this.config.current.strategy)) {
                const probeResult = await this.probe(this.cachedAssignments.get(agent));
                if (probeResult.verdict === "ok") {
                    continue;
                }
            }
            const result = await this.choose(agent);
            this.cachedAssignments.set(agent, result ?? this.candidates.get(agent)?.[0]);
        }
        return this.cachedAssignments;
    }
    pin(agent, modelTarget) {
        if (!this.modelStore.getModel(modelTarget)) {
            throw new Error(`Cannot pin unknown model: ${modelTarget}`);
        }
        this.pins.set(agent, modelTarget);
    }
    unpin(agent) {
        this.pins.delete(agent);
    }
    async assignModels() {
        const assignments = await this.getAssignments();
        return await this.ctxAgent.transform((editor) => {
            let assigned = 0;
            const failed = [];
            for (const [agentName, ref] of assignments) {
                if (!ref)
                    continue;
                const model = {
                    providerID: Provider.ID.make(ref.providerID),
                    id: Model.ID.make(ref.id),
                };
                for (const id of [routerAgentID(agentName), agentName]) {
                    try {
                        editor.update(id, (agent) => {
                            agent.id = Agent.ID.make(id);
                            agent.name = Agent.Name.make(agentName);
                            agent.model = model;
                        });
                        assigned += 1;
                    }
                    catch (error) {
                        failed.push(`${id}: ${String(error)}`);
                    }
                }
            }
            logger.log(`agent transform: ${assigned} applied, for ${assignments.size} role(s)` +
                (failed.length > 0 ? `, failed ${failed.join("; ")}` : ""));
        });
    }
    async choose(agent) {
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
        return this.probeAndSelect(agent);
    }
    async probeAndSelect(agent) {
        const candidates = this.candidates.get(agent);
        if (!candidates || candidates.length === 0)
            return undefined;
        for (const candidate of candidates) {
            if (this.modelStore.needsProbe(candidate.target)) {
                const result = await this.probe(candidate);
                this.modelStore.recordProbe(candidate.target, result, 60 * 1000); // 1 minute cooldown for probe results
            }
            if ((this.modelStore.getModel(candidate.target)?.health ?? 1) >=
                this.config.current.minHealth) {
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
