# OpenCode Agent Router

Keeps every agent on a working model, automatically.

The plugin watches your model catalog, picks a healthy model for each agent, and
points that agent at it. When a model starts failing, the next refresh moves the
agent somewhere else. You keep one stable name per role — the model behind it
changes.

## Install

Add it to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "git+https://github.com/aadityataparia/opencode-agent-router.git#main",
    },
  ],
}
```

Restart OpenCode. On first run the plugin writes one agent file per role to
`~/.config/opencode/agents/model-router/`.

## Using it

Each managed role gets an agent named `model-router/<role>` — for example
`model-router/explorer`. Point a role at that agent and the router takes over
which model it runs on.

To have the plugin do that for you, set the roles in your orchestrator preset to
the routed agent instead of a model:

```json
{
  "explorer": { "model": "model-router/explorer" },
  "fixer": { "model": "model-router/fixer" }
}
```

OpenCode's agent picker lists the routed agents alongside your own, and a sidebar
panel shows what each role is currently on. Click the panel header to expand the
full list.

## `/router`

Run it from OpenCode's command picker so it reaches the plugin. Replies are posted
to the session, so they cost no model call.

| command                        | effect                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `/router`                      | show routing status                                                                            |
| `/router usable <agent>`       | show the pool for one agent (defaults to the current session agent)                            |
| `/router refresh [<agent>...]` | re-run routing now, optionally for specific agents; re-probes models that are not cooling down |
| `/router strategy <name>`      | switch routing strategy and re-run now (session-only, reset on restart)                        |
| `/router pin <agent> <model>`  | force one agent onto one model (saved to plugin storage, survives restart)                     |
| `/router unpin <agent>`        | drop one pin                                                                                   |
| `/router unpin`                | drop every pin (also `/router pin --clear`)                                                    |
| `/router debug <model>`        | show one model's stored record (health, latency, cooldown)                                     |
| `/router probe <model>`        | ping one model now and report the raw result                                                   |

`refresh` re-runs the routing pass and re-probes candidates that are not in
cooldown; it does not re-scan providers, and cooling-down models keep their last
verdict. Pins are stored in plugin storage and survive restarts; the strategy
choice is session-only. For a permanent change, set `presets` in the plugin
options or point the agent at `model-router/<agent>` directly.

Aliases: status = show/list · refresh = reload/rescan · usable = pool/models ·
unpin = reset · probe = ping · help = ?

## Configuration

Options go in the plugin entry's `options` object and are read only from there — no
option has an environment override. The one switch the plugin reads from the
environment is `OPENCODE_AGENT_ROUTER_TRACE`: point it at a file and the plugin
appends its `log`, `warn`, `error` and `trace` lines there
(`OPENCODE_AGENT_ROUTER_TRACE=/tmp/router.log opencode`). `XDG_CONFIG_HOME`
relocates the config home the managed agent files are written to.

| option             | default            | meaning                                                                                                 |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------- |
| `strategy`         | `adaptive`         | how to choose among candidates: `adaptive`, `latency`, `cost`, `round-robin`                             |
| `refreshMs`        | `3600000` (1 hour) | how often the router re-runs its assignment pass on its own                                             |
| `probeTimeoutMs`   | `10000` (10s)      | how long a single probe may take                                                                        |
| `cooldownMs`       | `60000` (1 min)    | how long a model sits out in cooldown after a failed probe before it is probed again                    |
| `presets`          | auto-detected      | which orchestrator presets' agents to route: `oh-my-opencode`, `oh-my-openagent`, `oh-my-opencode-slim`  |
| `agents`           | `{}`               | per-agent requirement overrides (`weights`, `minContext`, `tools`); routed regardless of preset          |
| `ignoredProviders` | `[]`               | provider ids to skip entirely — their models never enter the pool                                        |

```json
{
  "package": "git+https://github.com/aadityataparia/opencode-agent-router.git#main",
  "options": {
    "probeTimeoutMs": 5000,
    "strategy": "cost",
    "agents": {
      "fast-coder": {
        "weights": {
          // weight can be given to "reasoning", "coding", "fast", "vision", "long-context", "cheap", "general"
          "coding": 1.0,
          "fast": 0.9,
          "cheap": 0.8,
          "general": 0.3
        },

        "minContext": 32000,
        "tools": true // if true, agent should have tools capability
      }
    }
  }
}
```

### Probing

There is no on/off switch: the router always probes. Each candidate is matched
with a real one-token request (OpenCode's own generate call, so it uses the real
endpoint and stored credentials) before an agent is pointed at it, so a model
that is listed but dead is not picked. The verdict:

- `ok` — it answered; the model is chosen, recorded as a success and taken out
  of cooldown.
- `unusable` — the endpoint will not serve it (a spent quota, or a hard
  failure); recorded as a failure and put in cooldown.
- `unauthorized` — the credential was rejected; not selected this pass, and
  recorded like any other failure.
- `inconclusive` — a transient throttle (a `429` / "too many requests" that
  names a per-second or per-minute limit); not selected this pass either.

Any non-`ok` verdict leaves the model unselected for the pass and puts it in a
`cooldownMs` cooldown; it is not probed again until that clears, then returns to
the pool. A failed probe never removes a model permanently — to exclude a
provider outright, list it in `ignoredProviders`.

## Troubleshooting

**A routed agent has no model.** The agent file is missing, or the role is not
under the detected preset. Check `/router` for the detected presets.

**A dispatched agent fails to start.** If the error mentions a variant, the model
behind that role has no such variant; drop `variant` from the role's config.

**A model looks right but is not used.** Run `/router refresh` to re-run routing,
then `/router debug <model>` to inspect one model; a model in cooldown keeps its
last verdict until that cooldown clears, and check for a rejected credential.
