import { routerAgentID, } from "./types";
import { findCandidates } from "./scorer";
import { Agent, Model, Provider } from "@opencode/plugin";
import { logger } from "./logger";
import { syncRoutedAgents } from "./agent-files";
const PIN_KEY = "model-router:pins";
const ASSIGNMENT_KEY = "model-router:assignments";
export class Router {
    modelStore;
    config;
    storage;
    probe;
    ctxAgent;
    pins = new Map();
    cachedAssignments = new Map();
    transformDisposer;
    constructor(modelStore, config, storage, probe, ctxAgent) {
        this.modelStore = modelStore;
        this.config = config;
        this.storage = storage;
        this.probe = probe;
        this.ctxAgent = ctxAgent;
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
    async getAssignments(agents) {
        const agentsToProcess = agents || Object.keys(this.config.current.agents);
        for (const agent of agentsToProcess) {
            const result = await this.choose(agent);
            this.cachedAssignments.set(agent, result ??
                this.cachedAssignments.get(agent) ??
                this.getCandidates(agent)?.[0]);
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
    async assignModels(agents) {
        const assignments = await this.getAssignments(agents);
        this.transformDisposer?.();
        this.transformDisposer = undefined;
        const registration = await this.ctxAgent.transform((editor) => {
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
                            agent.name = Agent.Name.make(id);
                            agent.model = model;
                        });
                        assigned += 1;
                    }
                    catch (error) {
                        failed.push(`${id}: ${String(error)}`);
                    }
                }
            }
            syncRoutedAgents(Array.from(assignments.keys()), assignments, (message) => {
                logger.warn(`syncRoutedAgents: ${message}`);
            });
            logger.log(`agent transform: ${assigned} applied, for ${assignments.size} role(s)` +
                (failed.length > 0 ? `, failed ${failed.join("; ")}` : ""));
        });
        let disposed = false;
        const dispose = () => {
            if (disposed)
                return;
            disposed = true;
            // Only tear down our own registration: a later `assignModels` may already
            // have replaced this one, and disposing that would drop live routing.
            if (this.transformDisposer === dispose) {
                this.transformDisposer = undefined;
            }
            registration.dispose();
        };
        this.transformDisposer = dispose;
        return { dispose };
    }
    async choose(agent) {
        if (!this.config.current.agents[agent])
            return undefined;
        const candidates = this.sort(this.getCandidates(agent) || [], this.config.current.strategy);
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
        const candidates = this.getCandidates(agent);
        if (!candidates || candidates.length === 0)
            return undefined;
        for (const candidate of candidates) {
            if (this.modelStore.needsProbe(candidate.target)) {
                const result = await this.probe(candidate);
                this.modelStore.recordProbe(candidate.target, result, 60 * 1000); // 1 minute cooldown for probe results
                if (result.verdict !== "ok" && result.verdict !== "inconclusive") {
                    continue;
                }
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
    getCandidates(agent) {
        return this.sort(findCandidates(this.config.current.agents[agent], this.modelStore.getAllModels()), this.config.current.strategy);
    }
}
