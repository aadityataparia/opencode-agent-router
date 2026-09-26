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
      ? current.latencyMs * 0.8 + latencyMs * 0.2
      : latencyMs;
    current.health = Math.min(1, current.health * 0.8 + 1 * 0.2);
    current.cooldownUntil = undefined;
  }

  failure(model: DiscoveredModel, cooldownMs = 30_000): void {
    const current = this.state.get(this.key(model));
    if (!current) return;

    current.failures++;
    current.lastFailureAt = Date.now();
    current.health = Math.max(0, current.health * 0.7);
    current.cooldownUntil = Date.now() + cooldownMs;
  }

  isCoolingDown(model: DiscoveredModel): boolean {
    return Boolean(model.cooldownUntil && model.cooldownUntil > Date.now());
  }

  /**
   * True when a probe result is stale enough to be worth spending a request on.
   * Never-probed models always need one.
   */
  needsProbe(model: DiscoveredModel, ttlMs: number): boolean {
    const current = this.state.get(this.key(model));
    if (!current?.lastProbeAt) return true;
    return Date.now() - current.lastProbeAt >= ttlMs;
  }

  /**
   * Folds a probe outcome into health. A ping is scored exactly like a real
   * request so the router learns from one signal, not two.
   */
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

  successRate(model: DiscoveredModel): number {
    const total = model.successes + model.failures;
    return total === 0 ? 0.5 : model.successes / total;
  }
}
