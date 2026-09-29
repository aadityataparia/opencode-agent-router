import type { AgentName, Candidate, RoutingStrategy } from "./types";

export class Router {
  private readonly cursors = new Map<AgentName, number>();

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
      case "cost":
        return [...candidates].sort(
          (a, b) => b.breakdown.cost - a.breakdown.cost,
        )[0];
      case "adaptive":
      default:
        return candidates[0];
    }
  }

  private roundRobin(agent: AgentName, candidates: Candidate[]): Candidate {
    const cursor = this.cursors.get(agent) ?? 0;
    const candidate = candidates[cursor % candidates.length];
    this.cursors.set(agent, cursor + 1);
    return candidate;
  }

  private weighted(candidates: Candidate[]): Candidate {
    const weights = candidates.map((candidate) => candidate.score);
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
}
