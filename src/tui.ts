import { readFileSync } from "node:fs";
import { createElement, insert, JSX, setProp } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";
import { logger } from "./logger";

/** Renders the routed agents in the sidebar: reference information, not a task worth a model turn. */
const ROUTER_AGENT_PREFIX = "model-router/";
const REFRESH_MS = 5_000;

interface SelectedModel {
  readonly providerID: string;
  readonly id: string;
  readonly variant?: string;
  readonly agent?: string;
  readonly target: string;
}

interface Route {
  readonly agent: string;
  readonly target?: string;
}

type TuiContext = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0];
type TuiLocation = ReturnType<TuiContext["data"]["location"]["default"]>;
type Theme = TuiContext["theme"];
type BaseRenderable = JSX.Element;

export const OpenCodeAgentRouterTui = Plugin.define({
  id: "opencode-agent-router.tui",
  setup: (ctx: TuiContext) => {
    const theme = ctx.theme;
    logger.trace(`setup version=${readVersion()}`);

    let expanded = false;
    let disposed = false;
    let disposeSlot: (() => void) | undefined;

    let routes: Route[] = [];
    const refreshRoutes = async (): Promise<void> => {
      try {
        const result = await ctx.client.agent.list({});
        const agents = result.data ?? [];
        routes = toRoutes(agents);
        logger.trace(
          `agent.list total=${agents.length} routed=${routes.length} ids=${agents
            .map((a) => a.id)
            .join("|")}, models=${agents
            .map((a) => a.model?.providerID + "/" + a.model?.id)
            .join("|")}`,
        );
      } catch (error) {
        logger.trace(`agent.list failed ${String(error)}`);
      }
    };

    const build = (): Element => {
      const location = ctx.location ?? ctx.data.location.default();
      const selected = readSelection(ctx, location);
      const current = selected?.agent
        ? routes.find((route) => route.agent === selected.agent)
        : undefined;

      const visible: Route[] = expanded
        ? [
            ...(current ? [current] : []),
            ...routes.filter((route) => route.agent !== current?.agent),
          ]
        : [current].filter((x): x is Route => !!x);

      logger.trace(
        `render expanded=${expanded} routes=${routes.length} current=${current?.agent ?? "none"} visible=${visible.length}`,
      );

      return column(
        {
          width: "100%",
          border: "rounded",
        },
        [
          header(theme, readVersion(), expanded, routes.length, () => {
            expanded = !expanded;
            logger.trace(`toggle expanded=${expanded}`);
            rebuild();
          }),
          ...visible.map((route) =>
            routeRow(theme, route, {
              current: route.agent === current?.agent,
              // An unassigned route has no target, so it must never compare equal
              // to the selection and claim to be the model in use.
              currentModel: selected?.target,
              variant:
                route.agent === current?.agent ? selected?.variant : undefined,
            }),
          ),
          ...emptyState(theme, routes, current, expanded),
        ],
      ) as unknown as Element;
    };

    // The host exposes no reactive hook for the sidebar's inputs, and a tree
    // this size is cheap to rebuild, so re-claim the slot when state changes.
    const rebuild = (): void => {
      if (disposed) return;
      disposeSlot?.();
      disposeSlot = ctx.ui.slot({ append: "sidebar.content", render: build });
      ctx.renderer.requestRender();
    };

    let signature = "";

    // The event is a nudge; the rebuild re-reads state, so it carries no data.
    const onChange = (label: string): void => {
      logger.trace(label);
      void refreshRoutes().then(() => {
        rebuild();
        // Re-seed so the poll does not rebuild the same tree again.
        signature = stateSignature(ctx, routes);
      });
    };

    // `agent.updated` is what the server emits when the router re-assigns a
    // role, so the panel follows a routing refresh instead of waiting for the
    // next poll.
    const unsubscribeAgent = ctx.data.on("agent.updated", () =>
      onChange("agent.updated"),
    );
    const unsubscribe = ctx.data.on("session.model.selected", (event) => {
      onChange(
        `model.selected ${event.data.model.providerID}/${event.data.model.id}`,
      );
    });

    const timer = setInterval(() => {
      void refreshRoutes().then(() => {
        const next = stateSignature(ctx, routes);
        if (next === signature) return;
        signature = next;
        logger.trace(`change ${next}`);
        rebuild();
      });
    }, REFRESH_MS);

    onChange("init");

    return () => {
      disposed = true;
      clearInterval(timer);
      unsubscribe();
      unsubscribeAgent();
      disposeSlot?.();
    };
  },
});

export default OpenCodeAgentRouterTui;

/* ---------------------------------------------------------------- rendering */

type PropType = string | number | Theme["text"]["base"] | boolean;

type Child =
  | JSX.Element
  | string
  | number
  | null
  | undefined
  | false
  | (() => string);

function element(
  tag: string,
  props: Record<string, unknown>,
  children: Child[] = [],
) {
  const node = createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) setProp(node, key, value);
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    insert(node, child);
  }

  return node as unknown as JSX.Element;
}

const box = (
  props: Record<string, PropType>,
  children: Child[] = [],
): BaseRenderable => element("box", props, children);

const text = (
  props: Record<string, PropType>,
  children: Child[],
): BaseRenderable => element("text", props, children);

const column = (
  props: Record<string, PropType>,
  children: Child[],
): BaseRenderable => box({ flexDirection: "column", ...props }, children);

/** `Model Router` badge on the left, plugin version muted on the right. */
function header(
  theme: Theme,
  version: string,
  expanded: boolean,
  count: number,
  onToggle: () => void,
): BaseRenderable {
  const row = box(
    {
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    [
      box({ paddingRight: 1, backgroundColor: theme.background.raised.base }, [
        text({ fg: theme.text.base, fontWeight: "bold" }, [
          `${expanded ? "▼" : "▶"} Model Router (${count})`,
        ]),
      ]),
      text({ fg: theme.text.muted, wrapMode: "none" }, [`v${version}`]),
    ],
  );

  setProp(row as never, "onMouseUp", onToggle);

  return row;
}

function routeRow(
  theme: Theme,
  route: Route,
  options: {
    current: boolean;
    currentModel: string | undefined;
    variant?: string;
  },
): BaseRenderable {
  const fg =
    options.current && options.currentModel
      ? theme.text.feedback.success.base
      : theme.text.base;
  const marker = options.current ? "• " : "  ";
  const model = options.current ? options.currentModel : route.target;
  return box(
    {
      width: "100%",
      flexDirection: "column",
      justifyContent: "space-between",
      shouldFill: true,
    },
    [
      text({ fg, wrapMode: "none", truncate: true, flexShrink: 1 }, [
        `${marker}${route.agent}${options.current && route.target !== options.currentModel ? " (Manual)" : ""}`,
      ]),
      text(
        {
          fg:
            options.current && options.currentModel
              ? theme.text.base
              : theme.text.muted,
          wrapMode: "none",
          truncate: true,
          flexShrink: 1,
          textAlign: "right",
        },
        ["  ↳ " + (options.variant ? `${model} (${options.variant})` : model)],
      ),
    ],
  );
}

function emptyState(
  theme: Theme,
  routes: Route[],
  current: Route | undefined,
  expanded: boolean,
): BaseRenderable[] {
  if (routes.length === 0) {
    return [
      column({ width: "100%", marginTop: 1 }, [
        text({ fg: theme.text.muted, wrapMode: "none" }, [
          "No routes published",
        ]),
      ]),
    ];
  }
  if (expanded || current) return [];
  return [
    column({ width: "100%", marginTop: 1 }, [
      text({ fg: theme.text.muted, wrapMode: "none" }, [
        "Not on a routed model",
      ]),
    ]),
  ];
}

/* -------------------------------------------------------------------- state */

/** Live routes, read from the agents the server maintains. An agent with no model is not a route yet. */
function toRoutes(
  agents: readonly { id: string; model?: { providerID: string; id: string } }[],
): Route[] {
  const routes: Route[] = [];
  for (const agent of agents) {
    if (!agent.id.startsWith(ROUTER_AGENT_PREFIX)) continue;
    const model = agent.model;
    routes.push({
      agent: agent.id.slice(ROUTER_AGENT_PREFIX.length),
      target: model ? `${model.providerID}/${model.id}` : "no usable model",
    });
  }
  return routes.sort((a, b) => a.agent.localeCompare(b.agent));
}

/** The model in use now: from the session record, or the primary agent's model off a session. */
function readSelection(
  ctx: TuiContext,
  location: TuiLocation,
): SelectedModel | undefined {
  try {
    const route = ctx.ui.router.current();
    if (route.type === "session") {
      const agent = ctx.data.session
        .get(route.sessionID)
        ?.agent?.replace(ROUTER_AGENT_PREFIX, "");
      const model = ctx.data.session.get(route.sessionID)?.model;
      return model
        ? {
            providerID: model.providerID,
            id: model.id,
            variant: model.variant,
            target: `${model.providerID}/${model.id}`,
            agent,
          }
        : undefined;
    }

    const agents = ctx.data.location.agent.list(location) ?? [];
    const primary = agents.find((agent) => agent.mode === "primary");
    if (!primary?.model) return undefined;
    return {
      providerID: primary.model.providerID,
      target: `${primary.model.providerID}/${primary.model.id}`,
      id: primary.model.id,
      agent: primary.id,
    };
  } catch {
    return undefined;
  }
}

/** Change detector for the poll loop, from the same reads `build` performs. */
function stateSignature(ctx: TuiContext, routes: readonly Route[]): string {
  const location = ctx.location ?? ctx.data.location.default();
  const selected = readSelection(ctx, location);
  const assigned = routes
    .map((route) => `${route.agent}=${route.target ?? ""}`)
    .join(",");
  const selection = [
    selected?.providerID ?? "",
    selected?.id ?? "",
    selected?.variant ?? "",
  ].join("/");
  return `${selection}#${assigned}`;
}

function readVersion(): string {
  try {
    const raw = readFileSync(
      new URL("./package.json", import.meta.url),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
