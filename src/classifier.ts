import type { DiscoveredModel, ModelCategory } from "./types.js"

const CODING = ["codex", "coder", "coding", "code", "codestral", "devstral", "deepseek-coder", "qwen-coder", "starcoder", "swe"]
const REASONING = ["reason", "reasoning", "thinking", "think", "o1", "o3", "o4", "r1", "r2", "opus"]
const FAST = ["mini", "nano", "flash", "haiku", "small", "lite", "fast", "instant"]
const CHEAP = ["mini", "nano", "flash", "haiku", "small", "lite"]

function contains(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern))
}

function inputSupportsImage(model: any): boolean {
  const input = model?.capabilities?.input
  return Array.isArray(input) && input.includes("image")
}

export function classifyModel(model: any): DiscoveredModel {
  const text = [
    model?.providerID,
    model?.id,
    model?.name,
    model?.family,
  ].filter(Boolean).join(" ").toLowerCase()

  const categories = new Set<ModelCategory>()

  const vision = Boolean(model?.capabilities?.vision) || inputSupportsImage(model) ||
    contains(text, ["vision", "vl", "multimodal"])

  const reasoning = Boolean(model?.capabilities?.reasoning) || contains(text, REASONING)
  const tools = Boolean(model?.capabilities?.tools)

  if (vision) categories.add("vision")
  if (reasoning) categories.add("reasoning")
  if (contains(text, CODING)) categories.add("coding")
  if (contains(text, FAST)) categories.add("fast")
  if (contains(text, CHEAP)) categories.add("cheap")
  if ((model?.limit?.context ?? 0) >= 100_000) categories.add("long-context")
  categories.add("general")

  return {
    providerID: String(model?.providerID ?? ""),
    id: String(model?.id ?? ""),
    name: model?.name,
    family: model?.family,
    context: Number(model?.limit?.context ?? 0),
    outputLimit: Number(model?.limit?.output ?? 0),
    capabilities: { reasoning, vision, tools },
    cost: {
      input: typeof model?.cost?.input === "number" ? model.cost.input : undefined,
      output: typeof model?.cost?.output === "number" ? model.cost.output : undefined,
    },
    categories,
    health: 1,
    latencyMs: Infinity,
    failures: 0,
    successes: 0,
  }
}
