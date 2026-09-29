import type { DiscoveredModel } from "./types.ts";

export class HealthStore {
  private readonly state = new Map<string, DiscoveredModel>();

  private key(model: Pick<DiscoveredModel, "providerID" | "id">): string {
    return `${model.providerID}/${model.id}`;
  }

  merge(models: DiscoveredModel[]): DiscoveredModel[] {
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

  success(model: DiscoveredModel, latencyMs: number): void {
    const current = this.state.get(this.key(model));
    if (!current) return;

    current.successes++;
    current.lastSuccessAt = Date.now();
    current.latencyMs = Number.isFinite(current.latencyMs)
      ? (current.latencyMs * (current.successes - 1) + latencyMs) /
        current.successes
      : latencyMs;
    current.health = current.successes / (current.successes + current.failures);
    current.cooldownUntil = undefined;
  }

  failure(model: DiscoveredModel, cooldownMs = 30_000): void {
    const current = this.state.get(this.key(model));
    if (!current) return;

    current.failures++;
    current.lastFailureAt = Date.now();
    current.health = current.successes / (current.successes + current.failures);
    current.cooldownUntil = Date.now() + cooldownMs;
  }

  isCoolingDown(model: DiscoveredModel): boolean {
    return Boolean(model.cooldownUntil && model.cooldownUntil > Date.now());
  }

  /** True when a probe result is stale enough to re-spend a request on; never-probed models always are. */
  needsProbe(model: DiscoveredModel, ttlMs: number): boolean {
    const current = this.state.get(this.key(model));
    if (!current?.lastProbeAt) return true;
    return Date.now() - current.lastProbeAt >= ttlMs;
  }

  /** A ping is scored exactly like a real request, so the router learns from one signal. */
  recordProbe(
    model: DiscoveredModel,
    result: { ok: boolean; latencyMs: number },
    cooldownMs: number,
  ): void {
    const current = this.state.get(this.key(model));
    if (!current) return;

    current.lastProbeAt = Date.now();
    if (result.ok) {
      this.success(model, result.latencyMs);
    } else {
      this.failure(model, cooldownMs);
    }
  }
}
