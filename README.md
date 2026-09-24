# OpenCode Agent Router

A dynamic OpenCode plugin that discovers models from the OpenCode runtime,
probes them, classifies them by capability, scores them per agent, and exposes
the result as **one alias model per managed agent** — `opencode/<agent>` —
each routing to the best real model via a request-body override. Point any
agent at `opencode/<agent>` and it gets automatic, health-aware re-routing.

Agents are never modified by this plugin, keeping agents owned by other
plugins and presets untouched.

## How it works

1. Reads every model exposed by `ctx.model.list()`.
2. Classifies models into: `reasoning`, `coding`, `fast`, `vision`,
   `long-context`, `cheap`, `general`.
3. Optionally performs lightweight reachability probes and maintains health,
   latency, success/failure and cooldown state.
4. Builds a candidate pool independently for each managed agent and picks the
   highest-scoring reachable model per routing strategy.
5. Attaches alias models to the native `opencode` provider via
   `ctx.provider.transform` + `ctx.provider.reload()`. Each alias
   (`opencode/sisyphus`, `opencode/orchestrator`, `opencode/designer`, …)
   carries a request-body override (`body.model` → routed real model), so it
   transparently forwards to the best model through OpenCode's zen endpoint.
6. Refreshes periodically — when health or availability changes, only the
   alias targets are re-pointed; agents keep their `opencode/<agent>`
   reference unchanged.

## Why models live on the `opencode` provider

The model list is gated on **availability**: the runtime (v2.0.16) only
surfaces models from native providers or providers with a resolvable
credential/connection. A config `provider` stub or a plugin-registered
provider is stored in the registry but never listed — a plugin cannot create
a connection (`ctx.provider` only exposes `list`/`get`/`transform`). The
`opencode` provider is the listed provider that proxies to the correct
endpoint (`https://opencode.ai/zen/v1`, `apiKey: "public"`), so alias models
attach there while keeping the requested model ids (`opencode/<agent>`).

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
**`opencode`** provider, named `orchestrator (routed)`, `explorer (routed)`,
`designer (routed)`, `sisyphus (routed)`, … — model ref `opencode/<agent>`.

Set an agent's model to `opencode/<agent>`:

```jsonc
{
  "agent": {
    "orchestrator": { "model": "opencode/orchestrator" }
  }
}
```

The plugin handles choosing the real model and re-routing it as health,
latency and availability change — the agent definition never changes.

## Compatibility

Verified against OpenCode `v2.0.16` using the `@opencode/plugin` SDK
(`Plugin.define`, `ctx.model.list()`, `ctx.provider.transform()` /
`ctx.provider.reload()`). Alias forwarding works through OpenCode's zen
endpoint, so aliases cover targets on the `opencode` provider.