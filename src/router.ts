import type {
  AgentName,
  Candidate,
  ProbeResult,
  RoutingStrategy,
} from "./types";
import { ModelStore } from "./model-store";
import { findCandidates } from "./scorer";
import { Config } from "./config";
import { StorageDomain } from "@opencode/plugin/promise/storage";

type CompactModel = Pick<Candidate, "id" | "providerID" | "target">;

const PIN_KEY = "model-router:pins";
const ASSIGNMENT_KEY = "model-router:assignments";

export class Router {
  private readonly candidates = new Map<AgentName, Candidate[]>();
  private readonly pins = new Map<AgentName, string>();
  readonly cachedAssignments = new Map<AgentName, CompactModel | undefined>();

  constructor(
    private readonly modelStore: ModelStore,
    private readonly config: Config,
    private readonly storage: StorageDomain,
  ) {
    for (const agent of Object.keys(config.current.agents) as AgentName[]) {
      this.candidates.set(
        agent,
        this.sort(
          findCandidates(
            this.config.current.agents[agent]!,
            this.modelStore.getAllModels(),
          ),
          this.config.current.strategy,
        ),
      );
    }
  }

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

  async getAssignments(
    probe: (model: Candidate) => Promise<ProbeResult>,
  ): Promise<Map<AgentName, CompactModel | undefined>> {
    for (const agent of Object.keys(
      this.config.current.agents,
    ) as AgentName[]) {
      // just probe if we already have model, to avoid changing models all the time
      if (
        this.cachedAssignments.has(agent) &&
        ["cost", "adaptive"].includes(this.config.current.strategy)
      ) {
        const probeResult = await probe(
          this.cachedAssignments.get(agent) as Candidate,
        );
        if (probeResult.verdict === "ok") {
          continue;
        }
      }

      const result = await this.choose(agent, probe);
      this.cachedAssignments.set(
        agent,
        result ?? this.candidates.get(agent)?.[0],
      );
    }

    return this.cachedAssignments;
  }

  pin(agent: AgentName, modelTarget: string): void {
    this.pins.set(agent, modelTarget);
  }

  unpin(agent: AgentName): void {
    this.pins.delete(agent);
  }

  private async choose(
    agent: AgentName,
    probe: (model: Candidate) => Promise<ProbeResult>,
  ): Promise<CompactModel | undefined> {
    if (!this.config.current.agents[agent]) return undefined;

    const candidates = this.sort(
      this.candidates.get(agent) || [],
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

    return this.probeAndSelect(agent, probe);
  }

  private async probeAndSelect(
    agent: AgentName,
    probe: (model: Candidate) => Promise<ProbeResult>,
  ): Promise<Candidate | undefined> {
    const candidates = this.candidates.get(agent);
    if (!candidates || candidates.length === 0) return undefined;

    for (const candidate of candidates) {
      if (this.modelStore.needsProbe(candidate.target)) {
        const result = await probe(candidate);
        this.modelStore.recordProbe(candidate.target, result, 60 * 1000); // 1 minute cooldown for probe results
        if (result.verdict === "ok") {
          return candidate;
        }
      } else if (this.modelStore.getModel(candidate.target)?.lastProbeResult) {
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
}
