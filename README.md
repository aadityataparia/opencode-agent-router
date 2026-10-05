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

| command                       | effect                                                      |
| ----------------------------- | ----------------------------------------------------------- |
| `/router`                     | show routing status                                         |
| `/router refresh`             | re-scan and re-probe now, ignoring probe cache and cooldown |
| `/router pin <agent> <model>` | force one agent onto one model                              |
| `/router unpin <agent>`       | drop one pin                                                |
| `/router unpin`               | drop every pin                                              |

Pins last for the session only and are lost on restart. For a permanent change,
edit the agent file or set `presets` in the plugin options.

## Configuration

Options go in the plugin entry's `options` object. Every one has an environment
variable equivalent named `OCO_ROUTER_<OPTION>` in upper case, which wins over the
config — handy for a one-off `OCO_ROUTER_LOG=true opencode`.

| option           | default           | meaning                                                                                      |
| ---------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| `probe`          | `false`           | check that a model answers before routing to it                                              |
| `probeTimeoutMs` | `8000`            | how long a single probe may take                                                             |
| `refreshMs`      | `300000` (5 mins) | how often to re-scan and re-assign                                                           |
| `strategy`       | `adaptive`        | how to choose among healthy models: `adaptive`, `round-robin`, `weighted`, `latency`, `cost` |
| `minHealth`      | `0.7`             | ignore models scoring below this, where 1 is perfect                                         |
| `maxFallbacks`   | `5`               | how many alternatives to try for one role                                                    |
| `presets`        | auto-detected     | which orchestrator plugins' agents to route                                                  |
| `agents`         | `{}`              | custum agents to route                                                                       |
| `log`            | `false`           | print debug log                                                                              |

```json
{
  "package": "git+https://github.com/aadityataparia/opencode-agent-router.git#main",
  "options": {
    "probe": true,
    "probeTimeoutMs": 5000,
    "strategy": "cost",
    "agents": {
      "fast-coder": {
        "weights": {
          // weight can be given to "reasoning", "coding", "fast", "long-context", "cheap", "general"
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

With `probe` off, the router trusts the catalog: it routes to models it can see.
With it on, each candidate gets a real one-token request first, so a model that
is listed but dead never gets picked. Probing costs a request per model per
refresh, which is why it is off by default.

A provider whose credentials are rejected is reported and its models are dropped
from the running until it works again. A model that is merely throttled stays
eligible.

## Troubleshooting

**A routed agent has no model.** The agent file is missing, or the role is not
under the detected preset. Check `/router` for the detected presets.

**A dispatched agent fails to start.** If the error mentions a variant, the model
behind that role has no such variant; drop `variant` from the role's config.

**A model looks right but is not used.** Run `/router refresh` to bypass the
probe cache and cooldown, and check for a rejected credential.
