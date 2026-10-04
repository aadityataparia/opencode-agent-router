import { Model } from "@opencode/plugin";
import type { DiscoveredModel, ModelCategory } from "./types";

const CODING = [
  "codex",
  "coder",
  "coding",
  "code",
  "codestral",
  "devstral",
  "deepseek-coder",
  "qwen-coder",
  "starcoder",
  "swe",
];
const REASONING = [
  "reason",
  "reasoning",
  "thinking",
  "think",
  "o1",
  "o3",
  "o4",
  "r1",
  "r2",
  "opus",
];
const FAST = [
  "mini",
  "nano",
  "flash",
  "haiku",
  "small",
  "lite",
  "fast",
  "instant",
];
const CHEAP = ["mini", "nano", "flash", "haiku", "small", "lite"];

function contains(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function inputSupportsVision(model: Model.Info): boolean {
  const input = model.capabilities?.input;
  if (!Array.isArray(input)) return false;
  return ["image", "video", "pdf"].some((kind) => input.includes(kind));
}

export function classifyModel(model: any): DiscoveredModel {
  const m = model as Model.Info;

  const text = [m.id, m.family].filter(Boolean).join(" ").toLowerCase();

  const categories = new Set<ModelCategory>();

  const vision =
    Boolean(model.capabilities?.vision) ||
    inputSupportsVision(model) ||
    contains(text, ["vision", "vl", "multimodal"]);

  const reasoning =
    Boolean(model.capabilities?.reasoning) ||
    // `reasoningField` on the catalog entry indicates the model emits
    // reasoning content, even when `capabilities.reasoning` is absent.
    Boolean(m.compatibility?.reasoningField) ||
    contains(text, REASONING);
  const tools = Boolean(m.capabilities?.tools);

  if (vision) categories.add("vision");
  if (reasoning) categories.add("reasoning");
  if (contains(text, CODING)) categories.add("coding");
  if (contains(text, FAST)) categories.add("fast");
  if (contains(text, CHEAP)) categories.add("cheap");
  if ((m.limit?.context ?? 0) >= 100_000) categories.add("long-context");
  categories.add("general");

  return {
    providerID: String(m.providerID ?? ""),
    id: String(m.id ?? m.modelID ?? ""),
    modelID: m.modelID ?? m.id,
    target: `${m.providerID}/${m.id ?? m.modelID}`,
    name: m.name,
    family: m.family,
    context: Number(m.limit?.context ?? 0),
    outputLimit: Number(m.limit?.output ?? 0),
    capabilities: { reasoning, vision, tools },
    cost: {
      input:
        typeof m.cost[0]?.input === "number" ? m.cost[0]?.input : undefined,
      output:
        typeof m.cost[0]?.output === "number" ? m.cost[0]?.output : undefined,
    },
    categories,
    health: 1,
    latencyMs: Infinity,
    lastProbeResult: true,
    failures: 0,
    successes: 0,
    releasedAt: m.time.released,
  };
}
