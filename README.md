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

Run `/routed-models` in the TUI to see where the model you currently have
selected actually routes. It renders a toast, for example:

```text
model-router/fixer
routes to opencode/mimo-v2.6-flash-free
```

If the selected model is not a `model-router` alias, the toast says so instead.
The command is registered by the CLI half of this plugin (`src/tui.ts`, exposed
as the `./tui` export), so it renders in the terminal and makes **no model
request** — unlike a server-side command, which OpenCode follows with a session
turn that spends a call restating the output.

## Compatibility

Built and tested against the OpenCode V2 plugin API: the server half uses
`Plugin.define`, `ctx.model.list()`, `ctx.provider.transform()`, and
`ctx.provider.reload()`; the CLI half uses `@opencode/plugin/tui` with
`ctx.keymap.layer()` and `ctx.ui.toast.show()`. The provider is registered
directly through the provider transform API so its aliases are listed as
`model-router/<agent>` rather than being mixed into the native `opencode`
provider.
