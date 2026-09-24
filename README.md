# OpenCode Agent Router

A dynamic OpenCode plugin that discovers models from the OpenCode catalog, probes them, classifies them by capability, scores them for each oh-my-opencode agent, and continuously refreshes the agent model/fallback chains.

It intentionally does **not** contain a hard-coded provider/model target list.

## What it does

1. Reads every model exposed by `ctx.catalog.model.list()`.
2. Uses catalog metadata to infer context, tools, vision, reasoning and cost.
3. Optionally performs lightweight reachability probes through the OpenCode session API.
4. Maintains health, latency, success/failure and cooldown state.
5. Classifies models into:
   - reasoning
   - coding
   - fast
   - vision
   - long-context
   - cheap
   - general
6. Builds a candidate pool independently for each oh-my-opencode agent.
7. Assigns the highest-scoring reachable model as the agent's primary model.
8. Writes additional candidates into `fallback_models`.
9. Refreshes periodically so newly connected providers/models become eligible automatically.

## Important OpenCode integration note

The plugin uses OpenCode's V2 agent transform API and the runtime model
catalog. Verified against OpenCode `v2.0.16`:

- Models are enumerated via `ctx.model.list()` — the `catalog` domain no
  longer exists in the v2 plugin context (the published
  `@opencode-ai/plugin` types may still declare it; trust the runtime).
- Agents are mutated inside `ctx.agent.transform(...)` via `agents.update(id, …)`
  and reloaded with `ctx.agent.reload()`.
- `ctx.options` only contains plugin options; do not assume an `agents` key.

Model reachability is primarily represented by catalog presence and optional
request probes; actual dispatch remains owned by OpenCode/oh-my-opencode.

Because OpenCode and oh-my-opencode evolve quickly, pin compatible versions in
your own environment and run `npm run check` after upgrades.

## Installation

Build:

```bash
npm install
npm run compile
```

> **Important:** do not add `build`, `prepare`, `prepack`, `install`, `preinstall`, or `postinstall` scripts back to `package.json`. OpenCode's bundled package resolver (bun) runs git-dependency preparation whenever one of those script names exists, and that preparation fails inside OpenCode's runtime — `opencode plugin add` then aborts with "git dep preparation failed". The compiled `dist/` is committed instead; keep it in sync with `npm run compile`.

Then load the built plugin from your OpenCode configuration. Example:

```json
{
  "plugin": [
    "/absolute/path/to/opencode-agent-router/dist/index.js"
  ]
}
```

If your OpenCode version expects a package/plugin identifier instead of a filesystem path, publish/install the package and use that identifier.

## Environment variables

- `OCO_ROUTER_REFRESH_MS` default `60000`
- `OCO_ROUTER_MAX_FALLBACKS` default `5`
- `OCO_ROUTER_PROBE` default `false`
- `OCO_ROUTER_PROBE_TIMEOUT_MS` default `8000`
- `OCO_ROUTER_STRATEGY` default `adaptive`
- `OCO_ROUTER_MIN_HEALTH` default `0.20`
- `OCO_ROUTER_LOG` default `false`

## Strategies

- `priority`: highest score first
- `round-robin`: rotate through eligible candidates
- `weighted`: weighted random based on score
- `latency`: lowest observed latency
- `rate`: highest recent success rate
- `adaptive`: combines suitability, health, latency, cost and context

Set:

```bash
export OCO_ROUTER_STRATEGY=adaptive
```

## Agent model requirements

The plugin models the current oh-my-opencode roster:

- sisyphus
- hephaestus
- prometheus
- atlas
- oracle
- librarian
- explore
- multimodal-looker
- metis
- momus
- sisyphus-junior

If an installation changes its agent roster, the plugin safely skips missing agents.

## Design

```text
OpenCode model catalog
        |
        v
  model scanner
        |
        v
 metadata classifier -----> capability categories
        |
        +----> health / latency state
        |
        v
 per-agent requirements
        |
        v
 candidate scoring
        |
        v
 routing strategy
        |
        +--> primary model
        +--> fallback_models
        |
        v
oh-my-opencode agent
```

## Safety behavior

- Models below the configured health threshold are excluded.
- Failed probes temporarily cool down a model.
- A model with insufficient context/tools/vision/reasoning is excluded when those are hard requirements.
- If no candidate satisfies an agent's hard requirements, the agent is left unchanged rather than assigned an unsuitable model.
- The plugin never embeds API keys or provider credentials.

## Limitations

A catalog entry is not identical to a successful inference request. Some providers expose models that can fail later because of quota, account permissions, region restrictions, transient outages or provider-specific constraints. The health tracker therefore improves decisions over time but cannot guarantee availability.

For production use, run with `OCO_ROUTER_PROBE=true` only after verifying that your OpenCode build permits the chosen probe mechanism and that probe traffic is acceptable for your provider accounts.
