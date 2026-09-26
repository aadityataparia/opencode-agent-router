# OpenCode Agent Router

A dynamic OpenCode plugin that discovers models from the OpenCode runtime,
classifies them by capability, scores them per agent, and exposes the result as
one alias model per managed agent under the **`model-router`** provider.

Point an agent at `model-router/<agent>` and the plugin keeps that reference
unchanged while automatically re-routing requests to the best available real
model. The plugin never modifies agent definitions owned by other plugins or
presets.

## How it works

1. Reads every model exposed by `ctx.model.list()`.
2. Classifies models into `reasoning`, `coding`, `fast`, `vision`,
   `long-context`, `cheap`, and `general` categories.
3. Optionally performs lightweight reachability probes and maintains health,
   latency, success/failure, and cooldown state.
4. Builds a candidate pool independently for each managed agent and picks the
   highest-scoring reachable model per routing strategy.
5. Registers the virtual `model-router` provider with one alias per assigned
   agent. Each alias carries a request-body override (`body.model`) pointing at
   the selected real model and forwards through OpenCode's compatible endpoint.
6. Refreshes periodically. When health or availability changes, only the alias
   targets are re-pointed; agents keep their `model-router/<agent>` reference.

## Configuration

| Option | Meaning |
| --- | --- |
| `refreshMs` | Interval between refresh passes (default `60_000`). |
| `strategy` | Routing strategy: `priority`, `round-robin`, `weighted`, `latency`, `rate`, `adaptive`. |
| `minHealth` | Minimum health score for a model to be routable (default `0.2`). |
| `probe` | Enable reachability probes (default `false`). |
| `probeTimeoutMs` | Probe timeout per model (default `8_000`). |
| `maxFallbacks` | Candidate fallbacks considered per agent (default `5`). |
| `log` | Verbose logging (env `OCO_ROUTER_LOG=true` also enables it). |
| `agents` | Extra agent definitions (requirement categories/weights). |

## Usage

With the plugin installed, routed models appear in the model list under
**Model Router**, for example:

```text
model-router/orchestrator
model-router/explorer
model-router/designer
model-router/sisyphus
```

Configure an agent to use a routed model:

```jsonc
{
  "agent": {
    "orchestrator": { "model": "model-router/orchestrator" }
  }
}
```

The plugin handles choosing the real model and re-routing it as health, latency,
and availability change. No agent definition needs to be rewritten when the
selected target changes.

## Inspecting routes

Run `/routed-models` in any session to print the model currently routed to every
agent. The report is read from the routes that were actually published to
OpenCode, so it always matches what a request would use right now:

```text
/routed-models
```

```text
Model Router (3 agents, adaptive, updated 12s ago)
  explorer      model-router/explorer -> opencode/grok-code-fast-1
  fixer         model-router/fixer -> opencode/claude-sonnet-4-5
  orchestrator  model-router/orchestrator -> opencode/gpt-5
```

Agents with no routable candidate are left out of the report; the command prints a
single explanatory line when nothing has been published yet.

## Compatibility

Built and tested against the OpenCode V2 plugin API (`Plugin.define`,
`ctx.model.list()`, `ctx.provider.transform()`, `ctx.provider.reload()`, and
`ctx.command.transform()`). The provider is registered directly through the
provider transform API so its aliases are listed as `model-router/<agent>` rather
than being mixed into the native `opencode` provider. `/routed-models` reports
through a synthetic session message, so it displays the table without spending a
model request.
