import type { DiscoveredModel, ProbeResult } from "./types.ts";
import { classifyModel } from "./classifier.js";
import { StorageDomain } from "@opencode/plugin/promise/storage";
import { JsonValue, ModelInfo } from "@opencode/client";
import { Config } from "./config.js";

const MODEL_STATE_KEY = "model-router:model-state:";

export class ModelStore {
  private readonly state = new Map<string, DiscoveredModel>();

  constructor(
    private readonly storage: StorageDomain,
    private readonly config: Config,
  ) {}

  async setCatalog(catalog: ModelInfo[]): Promise<void> {
    for (const model of catalog) {
      if (this.config.current.ignoredProviders.includes(model.providerID)) {
        continue;
      }
      const classified = classifyModel(model);
      const previous = (await this.storage.get(
        MODEL_STATE_KEY + classified.target,
      )) as unknown as DiscoveredModel | undefined;
      const merged = previous
        ? {
            ...classified,
            health: previous.health,
            latencyMs: previous.latencyMs,
            failures: previous.failures,
            successes: previous.successes,
            lastSuccessAt: previous.lastSuccessAt,
            lastFailureAt: previous.lastFailureAt,
            cooldownUntil: previous.cooldownUntil,
            lastProbeAt: previous.lastProbeAt,
            lastProbeResult: previous.lastProbeResult,
          }
        : classified;
      this.setModel(merged);
    }
  }

  getModel(target: string) {
    return this.state.get(target);
  }

  setModel(model: DiscoveredModel): void {
    void this.storage.set(
      MODEL_STATE_KEY + model.target,
      model as unknown as JsonValue,
    );
    this.state.set(model.target, model);
  }

  getAllModels(filter?: string): DiscoveredModel[] {
    let models = Array.from(this.state.values());
    if (filter) {
      models = models.filter((model) => model.target.includes(filter));
    }
    return models;
  }

  private success(model: DiscoveredModel, latencyMs: number): void {
    const current = this.state.get(model.target);
    if (!current) return;

    current.successes++;
    current.lastSuccessAt = Date.now();
    current.latencyMs = Number.isFinite(current.latencyMs)
      ? (current.latencyMs * (current.successes - 1) + latencyMs) /
        current.successes
      : latencyMs;
    current.health = current.successes / (current.successes + current.failures);
    current.cooldownUntil = undefined;
    current.lastProbeResult = true;

    this.setModel(current);
  }

  private failure(model: DiscoveredModel, cooldownMs = 30_000): void {
    const current = this.state.get(model.target);
    if (!current) return;

    current.failures++;
    current.lastFailureAt = Date.now();
    current.health = current.successes / (current.successes + current.failures);
    current.cooldownUntil = Date.now() + cooldownMs;
    current.lastProbeResult = false;

    this.setModel(current);
  }

  private isCoolingDown(model: DiscoveredModel): boolean {
    return Boolean(model.cooldownUntil && model.cooldownUntil > Date.now());
  }

  /** True when a probe result is stale enough to re-spend a request on; never-probed models always are. */
  needsProbe(target: string): boolean {
    const current = this.state.get(target);
    if (!current?.lastProbeAt) return true;
    return (
      Date.now() - current.lastProbeAt >= this.config.current.refreshMs &&
      !this.isCoolingDown(current)
    );
  }

  /** A ping is scored exactly like a real request, so the router learns from one signal. */
  recordProbe(target: string, result: ProbeResult, cooldownMs: number): void {
    const current = this.state.get(target);
    if (!current) return;

    current.lastProbeAt = Date.now();
    if (result.verdict === "ok") {
      this.success(current, result.latencyMs);
    } else {
      this.failure(current, cooldownMs);
    }
  }
}
