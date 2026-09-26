import type { AgentName, Candidate, RoutingStrategy } from "./types";
import { HealthStore } from "./health";

export class Router {
  private readonly cursors = new Map<AgentName, number>();

  constructor(private readonly health: HealthStore) {}

  choose(
    agent: AgentName,
    candidates: Candidate[],
    strategy: RoutingStrategy,
  ): Candidate | undefined {
    if (candidates.length === 0) return undefined;

    switch (strategy) {
      case "round-robin":
        return this.roundRobin(agent, candidates);
      case "weighted":
        return this.weighted(candidates);
      case "latency":
        return [...candidates].sort(
          (a, b) => this.normalizedLatency(a) - this.normalizedLatency(b),
        )[0];
      case "rate":
        return [...candidates].sort(
          (a, b) =>
            this.health.successRate(b.model) - this.health.successRate(a.model),
        )[0];
      case "priority":
        return candidates[0];
      case "adaptive":
      default:
        return this.adaptive(candidates);
    }
  }

  private roundRobin(agent: AgentName, candidates: Candidate[]): Candidate {
    const cursor = this.cursors.get(agent) ?? 0;
    const candidate = candidates[cursor % candidates.length];
    this.cursors.set(agent, cursor + 1);
    return candidate;
  }

  private weighted(candidates: Candidate[]): Candidate {
    const weights = candidates.map((candidate) =>
      Math.max(0.01, candidate.score),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let pick = Math.random() * total;

    for (let i = 0; i < candidates.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return candidates[i];
    }

    return candidates.at(-1)!;
  }

  private normalizedLatency(candidate: Candidate): number {
    return Number.isFinite(candidate.model.latencyMs)
      ? candidate.model.latencyMs
      : Number.MAX_SAFE_INTEGER;
  }

  private adaptive(candidates: Candidate[]): Candidate {
    return [...candidates].sort((a, b) => {
      const aRate = this.health.successRate(a.model);
      const bRate = this.health.successRate(b.model);
      const aLatency = this.normalizedLatency(a);
      const bLatency = this.normalizedLatency(b);

      const aValue =
        a.score + aRate * 0.25 - Math.min(aLatency / 10_000, 1) * 0.15;
      const bValue =
        b.score + bRate * 0.25 - Math.min(bLatency / 10_000, 1) * 0.15;

      return bValue - aValue;
    })[0];
  }
}
