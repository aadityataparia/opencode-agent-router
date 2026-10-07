import {
  CompactModel,
  routerAgentID,
  type AgentName,
  type Candidate,
  type ProbeResult,
  type RoutingStrategy,
} from "./types";
import { ModelStore } from "./model-store";
import { findCandidates } from "./scorer";
import { Config } from "./config";
import { StorageDomain } from "@opencode/plugin/promise/storage";
import { Agent, Model, Provider } from "@opencode/plugin";
import { Context } from "@opencode/plugin/promise/plugin";
import { logger } from "./logger";
import { syncRoutedAgents } from "./agent-files";
import { JsonValue } from "@opencode/client";

const PIN_KEY = "model-router:pins";
const ASSIGNMENT_KEY = "model-router:assignments";

export class Router {
  readonly pins = new Map<AgentName, string>();
  readonly cachedAssignments = new Map<AgentName, CompactModel | undefined>();

  private transformDisposer: (() => void) | undefined;

  constructor(
    private readonly modelStore: ModelStore,
    private readonly config: Config,
    private readonly storage: StorageDomain,
    readonly probe: (model: CompactModel) => Promise<ProbeResult>,
    private readonly ctxAgent: Context["agent"],
  ) {}

  async init() {
    const storedPins = (await this.storage.get(PIN_KEY)) as
      | Record<AgentName, string>
      | undefined;
    if (storedPins) {
      for (const [agent, target] of Object.entries(storedPins)) {
        this.pins.set(agent as AgentName, target);
      }
    }

    const storedAssignments = (await this.storage.get(ASSIGNMENT_KEY)) as
      | Record<AgentName, CompactModel>
      | undefined;
    if (storedAssignments) {
      for (const [agent, model] of Object.entries(storedAssignments)) {
        this.cachedAssignments.set(agent as AgentName, model);
      }
    }
  }

  private async getAssignments(
    agents?: AgentName[],
  ): Promise<Map<AgentName, CompactModel | undefined>> {
    const agentsToProcess =
      agents || (Object.keys(this.config.current.agents) as AgentName[]);
    for (const agent of agentsToProcess) {
      const result = await this.choose(agent);
      this.cachedAssignments.set(agent, result);
    }
    void this.storage.set(
      ASSIGNMENT_KEY,
      Object.fromEntries(this.cachedAssignments.entries()) as JsonValue,
    );

    return this.cachedAssignments;
  }

  pin(agent: AgentName, modelTarget: string): void {
    if (!this.modelStore.getModel(modelTarget)) {
      throw new Error(`Cannot pin unknown model: ${modelTarget}`);
    }
    this.pins.set(agent, modelTarget);
    void this.storage.set(PIN_KEY, Object.fromEntries(this.pins.entries()));
  }

  unpin(agent: AgentName): void {
    this.pins.delete(agent);
  }

  async assignModels(agents?: AgentName[]): Promise<{ dispose: () => void }> {
    const assignments = await this.getAssignments(agents);
    this.transformDisposer?.();
    this.transformDisposer = undefined;
    const registration = await this.ctxAgent.transform((editor) => {
      let assigned = 0;
      const failed: string[] = [];

      for (const [agentName, ref] of assignments) {
        const model = ref
          ? {
              providerID: Provider.ID.make(ref.providerID),
              id: Model.ID.make(ref.id),
            }
          : undefined;
        for (const id of [routerAgentID(agentName), agentName]) {
          try {
            editor.update(id, (agent) => {
              agent.id = Agent.ID.make(id);
              agent.name = Agent.Name.make(id);
              agent.model = model;
            });
            assigned += 1;
          } catch (error) {
            failed.push(`${id}: ${String(error)}`);
          }
        }
      }
      syncRoutedAgents(assignments);
      logger.log(
        `agent transform: ${assigned} applied, for ${assignments.size} role(s)` +
          (failed.length > 0 ? `, failed ${failed.join("; ")}` : ""),
      );
    });

    let disposed = false;
    const dispose = (): void => {
      if (disposed) return;
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

  private async choose(agent: AgentName): Promise<CompactModel | undefined> {
    if (!this.config.current.agents[agent]) return undefined;

    const candidates = this.sort(
      this.getCandidates(agent) || [],
      this.config.current.strategy,
    );
    if (candidates.length === 0) return undefined;

    if (this.pins.has(agent)) {
      const pinnedTarget = this.pins.get(agent)!;
      const pinnedCandidate = this.modelStore.getModel(pinnedTarget);
      if (pinnedCandidate) {
        return pinnedCandidate;
      }
    }

    return this.probeAndSelect(agent);
  }

  private async probeAndSelect(
    agent: AgentName,
  ): Promise<Candidate | undefined> {
    const candidates = this.getCandidates(agent);
    if (!candidates || candidates.length === 0) return undefined;

    const current = this.cachedAssignments.get(agent);
    if (current) {
      const result = await this.probe(current);
      this.modelStore.recordProbe(current.target, result, 60 * 1000);
      const model = this.modelStore.getModel(current.target);
      if (model?.lastProbeResult) {
        return candidates.find((c) => c.target === current.target);
      }
    }

    for (const candidate of candidates) {
      if (candidate.target === current?.target) continue;

      if (this.modelStore.needsProbe(candidate.target)) {
        const result = await this.probe(candidate);
        this.modelStore.recordProbe(candidate.target, result, 60 * 1000); // 1 minute cooldown for probe results
      }
      const model = this.modelStore.getModel(candidate.target);
      if (model?.lastProbeResult) {
        return candidate;
      }
    }

    return undefined;
  }

  private sort(
    candidates: Candidate[],
    strategy: RoutingStrategy,
  ): Candidate[] {
    if (candidates.length === 0) return [];

    switch (strategy) {
      case "round-robin":
        return candidates.toSorted(() => Math.random() - 0.5);
      case "latency":
        return candidates.toSorted(
          (a, b) => this.normalizedLatency(a) - this.normalizedLatency(b),
        );
      case "cost":
        return candidates.toSorted(
          (a, b) => b.breakdown.cost - a.breakdown.cost,
        );
      case "adaptive":
      default:
        return candidates.toSorted((a, b) => b.score - a.score);
    }
  }

  private normalizedLatency(candidate: Candidate): number {
    const model = this.modelStore.getModel(candidate.target);
    if (!model) return Number.MAX_SAFE_INTEGER;
    return Number.isFinite(model.latencyMs)
      ? model.latencyMs
      : Number.MAX_SAFE_INTEGER;
  }

  getCandidates(agent: AgentName): Candidate[] {
    return this.sort(
      findCandidates(
        this.config.current.agents[agent]!,
        this.modelStore.getAllModels(),
      ),
      this.config.current.strategy,
    );
  }
}
