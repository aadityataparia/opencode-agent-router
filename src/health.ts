import type { DiscoveredModel } from "./types.js"

export class HealthStore {
  private readonly state = new Map<string, DiscoveredModel>()

  private key(model: Pick<DiscoveredModel, "providerID" | "id">): string {
    return `${model.providerID}/${model.id}`
  }

  merge(models: DiscoveredModel[]): DiscoveredModel[] {
    return models.map((model) => {
      const previous = this.state.get(this.key(model))
      const merged = previous ? {
        ...model,
        health: previous.health,
        latencyMs: previous.latencyMs,
        failures: previous.failures,
        successes: previous.successes,
        lastSuccessAt: previous.lastSuccessAt,
        lastFailureAt: previous.lastFailureAt,
        cooldownUntil: previous.cooldownUntil,
      } : model

      this.state.set(this.key(model), merged)
      return merged
    })
  }

  success(model: DiscoveredModel, latencyMs: number): void {
    const current = this.state.get(this.key(model))
    if (!current) return

    current.successes++
    current.lastSuccessAt = Date.now()
    current.latencyMs = Number.isFinite(current.latencyMs)
      ? current.latencyMs * 0.8 + latencyMs * 0.2
      : latencyMs
    current.health = Math.min(1, current.health * 0.8 + 1 * 0.2)
    current.cooldownUntil = undefined
  }

  failure(model: DiscoveredModel, cooldownMs = 30_000): void {
    const current = this.state.get(this.key(model))
    if (!current) return

    current.failures++
    current.lastFailureAt = Date.now()
    current.health = Math.max(0, current.health * 0.7)
    current.cooldownUntil = Date.now() + cooldownMs
  }

  isCoolingDown(model: DiscoveredModel): boolean {
    return Boolean(model.cooldownUntil && model.cooldownUntil > Date.now())
  }

  successRate(model: DiscoveredModel): number {
    const total = model.successes + model.failures
    return total === 0 ? 0.5 : model.successes / total
  }
}
