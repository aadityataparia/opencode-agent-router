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

Every option can be set two ways: as a plugin option in your OpenCode config, or
as an environment variable. They use the same schema and the same key names.

```jsonc
{
  "plugin": [
    [
      "git+https://github.com/aadityataparia/opencode-agent-router.git#main",
      {
        "presets": ["oh-my-opencode-slim"],
        "probe": true,
        "strategy": "latency",
        "refreshMs": 30000
      }
    ]
  ]
}
```

```bash
OCO_ROUTER_PRESETS=oh-my-opencode-slim OCO_ROUTER_LOG=true opencode
```

**Precedence is environment variable → plugin option → default.** Env wins
because it is the ad-hoc layer: it is what a one-off
`OCO_ROUTER_LOG=true opencode` sets, and it must be able to override a
checked-in config without editing it. An env var set to an empty string counts
as unset, so `OCO_ROUTER_PROBE=` means "no preference" rather than `false`.

| Option | Env | Meaning |
| --- | --- | --- |
| `refreshMs` | `OCO_ROUTER_REFRESH_MS` | Interval between refresh passes (default `60000`). |
| `strategy` | `OCO_ROUTER_STRATEGY` | Routing strategy: `priority`, `round-robin`, `weighted`, `latency`, `rate`, `adaptive` (default `adaptive`). |
| `minHealth` | `OCO_ROUTER_MIN_HEALTH` | Minimum health score for a model to be routable, clamped to `0..1` (default `0.2`). |
| `probe` | `OCO_ROUTER_PROBE` | Ping models and route only to ones that answer (default `false`). |
| `probeTimeoutMs` | `OCO_ROUTER_PROBE_TIMEOUT_MS` | Timeout for a single probe (default `8000`). |
| `maxFallbacks` | `OCO_ROUTER_MAX_FALLBACKS` | Candidate fallbacks considered per agent (default `5`). |
| `log` | `OCO_ROUTER_LOG` | Verbose logging (default `false`). |
| `agents` | — | Extra agent definitions (requirement categories/weights). Always routed, regardless of preset. |
| `presets` | `OCO_ROUTER_PRESETS` | Which orchestrator plugin's agents to route for. Default: auto-detected from your OpenCode config. |

A value that cannot be used — `"soon"` for a number, `"turbo"` for a strategy,
an unknown preset name — is reported and ignored rather than silently coerced,
so a typo shows up in the log instead of quietly changing behaviour. With
`log` enabled, startup prints which settings were overridden and where each came
from:

```
routing for preset(s): oh-my-opencode-slim (config) | set: probe(config) log(config) refreshMs(env)
```

## Agent presets

The router publishes one alias per managed agent, so *which* agents it manages
depends on which orchestrator plugin you actually run. Routing every agent the
router has heard of would leave a slim-only user with `sisyphus` and `metis`
aliases for agents that do not exist in their install.

`presets` narrows routing to the agents a given plugin defines:

| Preset | Agents |
| --- | --- |
| `oh-my-opencode` | atlas, explore, hephaestus, librarian, metis, momus, multimodal-looker, oracle, prometheus, sisyphus, sisyphus-junior |
| `oh-my-openagent` | same 11 names as `oh-my-opencode` |
| `oh-my-opencode-slim` | orchestrator, explorer, librarian, oracle, designer, fixer, observer, council, councillor |

```bash
# one preset
OCO_ROUTER_PRESETS=oh-my-opencode-slim opencode

# several at once
OCO_ROUTER_PRESETS=oh-my-opencode,oh-my-opencode-slim opencode
```

Left unset, the router reads the `plugin` list from your OpenCode config and
routes for the presets it finds there, so the common case needs no
configuration. The config is the signal rather than the package cache on purpose:
a package can sit in `~/.cache/opencode` long after you removed it from your
config, and routing for a plugin you uninstalled is exactly what this avoids.
If no config can be read at all, the router falls back to routing for every
preset rather than silently routing for nothing.

Agents you declare yourself under `agents` are always routed, since declaring
one is an explicit opt-in that presets should not override.

## Probing

The catalog lists models the endpoint advertises, which is not the same set as
the models that actually answer. With `probe` enabled, every refresh pings each
candidate with a one-token completion and only models that pass become routing
candidates. Probe latency and outcome feed the same health score as real
traffic, so scoring has something to rank on.

```bash
OCO_ROUTER_PROBE=true OCO_ROUTER_LOG=true opencode
```

How it behaves:

- **Only `opencode` provider models are probed.** Aliases are created for that
  provider alone, so probing anything else would spend requests on models the
  router cannot select.
- **Probes are re-checked, not repeated.** A model is re-pinged only after five
  refresh intervals, and a model that just failed is skipped until its cooldown
  expires, so a dead model costs one probe per cooldown rather than one per
  refresh. Six probes run concurrently.
- **A rejected credential removes the model.** A model the gateway will not
  authenticate cannot serve routed traffic, whatever the gateway thinks of it, so
  it is excluded like any other dead model. Throttling (429) is the one failure
  that keeps a model, because it says nothing about the model itself.
- **Auth failures name the provider and the fix.** The first pass that sees them
  logs which provider rejected how many models, and points at
  `opencode auth login`. It is reported once rather than on every refresh, and
  again if the set of affected providers changes.
- **A bad endpoint cannot empty the pool.** If *every* model fails at once, that
  is the endpoint having a bad moment rather than the catalog being wrong, so the
  catalog is kept for that pass instead of deleting every alias.
- **Credentials matter.** Aliases forward through OpenCode's endpoint with its
  public key, so every model that needs a real API key is excluded until you
  connect one. Expect routing to collapse onto the free models until then, which
  is the honest answer: the paid ones would only fail on a real request.

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

The TUI half of the plugin adds a **Model Router** panel to the sidebar. It shows
the model the current selection routes to:

```text
┌────────────────────────────────┐
│ Model Router            v0.1.0 │
│                                │
│ ▸ Routes                       │
│ ▸ fixer    mimo-v2.6-flash-free │
└────────────────────────────────┘
```

Collapsed by default, so it stays out of the way. Click **▸ Routes** to expand it
and list every agent with its current target, current one first:

```text
│ ▾ Routes                  20   │
│ ▸ fixer    mimo-v2.6-flash-free │
│   explorer grok-code-fast-1     │
│   oracle   gpt-5                │
│   ...                           │
```

The highlighted `▸` row is the session's own model, read from the session record
so it reflects what a request would actually use. Off a session the primary
agent's configured model stands in, since that is what a new session would start
on.

The panel renders in the terminal and makes **no model request**. A slash command
would not: OpenCode starts a session turn after every command, so a command that
prints a route table costs a call to restate it.

Set `OPENCODE_AGENT_ROUTER_TRACE` to a file path to log what the panel renders
(selection resolved, route changes, expand/collapse) when debugging it in a real
TUI.

## Compatibility

Built and tested against the OpenCode V2 plugin API: the server half uses
`Plugin.define`, `ctx.model.list()`, `ctx.provider.transform()`, and
`ctx.provider.reload()`; the CLI half uses `@opencode/plugin/tui` and claims the
`sidebar.content` slot. The provider is registered directly through the provider
transform API so its aliases are listed as `model-router/<agent>` rather than
being mixed into the native `opencode` provider.

The TUI half declares no dependency on `@opentui/solid`: the host injects it at
runtime, the same way it provides `@opencode/plugin/tui`, so the module is
declared locally in `src/opentui.d.ts` for typechecking instead of being
vendored. If a future OpenCode version stops injecting it, the sidebar is the
only thing that breaks.
