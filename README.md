# OpenCode Agent Router

A dynamic OpenCode plugin that discovers models from the OpenCode runtime,
probes them, classifies them by capability, scores them per agent, and exposes
the result as a virtual **`model-router` provider**: one model per managed
agent (`model-router/<agent>`), each routing to the best real model.

Agents are never modified by this plugin. Point any agent at
`model-router/<agent>` (for example in a preset: `"model":
"model-router/orchestrator"`) and it gets automatic, health-aware re-routing
without the agent definition changing — this keeps agents owned by other
plugins and presets untouched.

## How it works

1. Reads every model exposed by `ctx.model.list()`.
2. Classifies models into: `reasoning`, `coding`, `fast`, `vision`,
   `long-context`, `cheap`, `general`.
3. Optionally performs lightweight reachability probes and maintains health,
   latency, success/failure and cooldown state.
4. Builds a candidate pool independently for each managed agent and picks the
   highest-scoring reachable model per routing strategy.
5. Registers a `model-router` provider (mirroring OpenCode's own provider:
   `@opencode/ai/providers/openai-compatible` against
   `https://opencode.ai/zen/v1`) with one model per assigned agent. Each alias
   model carries a request-body override (`body.model`) pointing at the routed
   real model, so `model-router/<agent>` transparently forwards to it.
6. Refreshes periodically — when health or availability changes, only the
   alias targets are re-pointed; agents keep their `model-router/<agent>`
   reference unchanged.

## Configuration

| Option | Meaning |
| --- | --- |
| `refreshMs` | Interval between refresh passes (default `60_000`). |
| `strategy` | Routing strategy: `priority`, `round-robin`, `weighted`, `latency`, `rate`, `adaptive`. |
| `minHealth` | Minimum health score for a model to be routable (default `0.5`). |
| `probe` | Enable reachability probes (default `true`). |
| `probeTimeoutMs` | Probe timeout per model (default `8_000`). |
| `maxFallbacks` | Candidate fallbacks considered per agent (default `3`). |
| `log` | Verbose logging (env `OCO_ROUTER_LOG=true` also enables it). |
| `agents` | Extra agent definitions (requirement categories/weights). |

## Usage

With the plugin installed, routed models appear in the model list under the
**`Model Router`** provider, e.g. `model-router/orchestrator`,
`model-router/explorer`, `model-router/designer`, `model-router/sisyphus`, …

Set an agent's model to `model-router/<agent>`:

```jsonc
{
  "agent": {
    "orchestrator": { "model": "model-router/orchestrator" }
  }
}
```

The plugin handles choosing the real model and re-routing it as health,
latency and availability change.

## Compatibility

Verified against OpenCode `v2.0.16` using the `@opencode/plugin` SDK
(`Plugin.define`, `ctx.model.list()`, `ctx.provider.transform()` /
`ctx.provider.reload()`). The router provider forwards to OpenCode's zen
endpoint, so aliases cover targets on the `opencode` provider.