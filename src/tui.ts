import { appendFileSync, readFileSync } from "node:fs";
import { createElement, insert, setProp } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";

/**
 * Terminal-side companion to the server plugin. The router itself runs on the
 * server; this reads the aliases the server published and renders them in the
 * OpenCode sidebar.
 *
 * A sidebar rather than a command: the route list is reference information, not
 * a task. A command would cost a model turn every time it was run, and a toast
 * would vanish before twenty routes could be read.
 */
const ROUTER_PROVIDER = "model-router";
const LABEL_WIDTH = 14;
const REFRESH_MS = 1_000;

const TRACE = process.env.OPENCODE_AGENT_ROUTER_TRACE;

interface SelectedModel {
  readonly providerID: string;
  readonly id: string;
  readonly variant?: string;
}

interface Route {
  readonly agent: string;
  readonly target: string;
}

type TuiContext = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0];
type TuiLocation = ReturnType<TuiContext["data"]["location"]["default"]>;
type Element = any;
type Theme = Record<string, string>;

/** Opt-in breadcrumb for verifying this plugin inside a real TUI. */
function trace(event: string): void {
  if (!TRACE) return;
  try {
    appendFileSync(TRACE, `${new Date().toISOString()} ${event}\n`);
  } catch {
    // Tracing must never break the sidebar.
  }
}

export const OpenCodeAgentRouterTui = Plugin.define({
  id: "opencode-agent-router.tui",
  setup: (ctx: TuiContext) => {
    const theme = ctx.theme as unknown as Theme;
    trace(`setup version=${readVersion()}`);

    // Collapsed by default: the one route that matters right now. Expanding is
    // an explicit act, so the sidebar stays quiet during normal work.
    let expanded = false;
    let disposed = false;
    let disposeSlot: (() => void) | undefined;

    const build = (): Element => {
      const location = ctx.location ?? ctx.data.location.default();
      const routes = readRoutes(ctx, location);
      const selected = readSelection(ctx, location);
      const current =
        selected?.providerID === ROUTER_PROVIDER
          ? routes.find((route) => route.agent === selected.id)
          : undefined;

      const visible = expanded
        ? [
            ...(current ? [current] : []),
            ...routes.filter((route) => route.agent !== current?.agent),
          ]
        : current
          ? [current]
          : [];

      trace(
        `render expanded=${expanded} routes=${routes.length} current=${current?.agent ?? "none"} visible=${visible.length}`,
      );

      return column(
        {
          width: "100%",
          border: "rounded",
          borderColor: theme.borderActive,
          padding: 1,
        },
        [
          header(theme, readVersion(), expanded, routes.length, () => {
            expanded = !expanded;
            trace(`toggle expanded=${expanded}`);
            rebuild();
          }),
          ...visible.map((route) =>
            routeRow(theme, route, {
              current: route.agent === current?.agent,
              variant:
                route.agent === current?.agent ? selected?.variant : undefined,
            }),
          ),
          ...emptyState(theme, routes, current, expanded),
        ],
      );
    };

    const claim = (): void => {
      disposeSlot = ctx.ui.slot({ append: "sidebar.content", render: build });
    };

    // The host exposes no reactive hook for the sidebar's inputs, and a tree
    // this size is cheap to rebuild, so re-claim the slot when state changes.
    const rebuild = (): void => {
      if (disposed) return;
      disposeSlot?.();
      claim();
      ctx.renderer.requestRender();
    };

    let signature = "";
    const timer = setInterval(() => {
      const next = stateSignature(ctx);
      if (next === signature) return;
      signature = next;
      trace(`change ${next}`);
      rebuild();
    }, REFRESH_MS);

    claim();
    signature = stateSignature(ctx);

    return () => {
      disposed = true;
      clearInterval(timer);
      disposeSlot?.();
    };
  },
});

export default OpenCodeAgentRouterTui;

/* ---------------------------------------------------------------- rendering */

function element(
  tag: string,
  props: Record<string, unknown> = {},
  children: unknown[] = [],
): Element {
  const node = createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) setProp(node, key, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    insert(node, child);
  }
  return node;
}

const box = (
  props: Record<string, unknown>,
  children: unknown[] = [],
): Element => element("box", props, children);

const text = (props: Record<string, unknown>, children: unknown[]): Element =>
  element("text", props, children);

const column = (props: Record<string, unknown>, children: unknown[]): Element =>
  box({ flexDirection: "column", ...props }, children);

/** `Model Router` badge on the left, plugin version muted on the right. */
function header(
  theme: Theme,
  version: string,
  expanded: boolean,
  count: number,
  onToggle: () => void,
): Element {
  const row = box(
    {
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    [
      box({ paddingRight: 1, backgroundColor: theme.accent }, [
        text({ fg: theme.background }, [
          `${expanded ? "▼" : "▶"} Model Router (${count})`,
        ]),
      ]),
      text({ fg: theme.textMuted, wrapMode: "none" }, [`v${version}`]),
    ],
  );

  return interactive(row, onToggle);
}

function routeRow(
  theme: Theme,
  route: Route,
  options: { current: boolean; variant?: string },
): Element {
  const fg = options.current ? theme.text : theme.textMuted;
  const marker = options.current ? "• " : "  ";
  return box(
    {
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
      shouldFill: true,
    },
    [
      box(
        {
          width: LABEL_WIDTH,
          flexShrink: 0,
          flexDirection: "row",
          shouldFill: false,
        },
        [
          text({ fg, wrapMode: "none", truncate: true, flexShrink: 1 }, [
            `${marker}${route.agent}`,
          ]),
        ],
      ),
      text(
        {
          fg: theme.textMuted,
          wrapMode: "none",
          truncate: true,
          flexShrink: 1,
        },
        [
          options.variant
            ? `${route.target} (${options.variant})`
            : route.target,
        ],
      ),
    ],
  );
}

function emptyState(
  theme: Theme,
  routes: Route[],
  current: Route | undefined,
  expanded: boolean,
): Element[] {
  if (routes.length === 0) {
    return [
      column({ width: "100%", marginTop: 1 }, [
        text({ fg: theme.textMuted, wrapMode: "none" }, [
          "No routes published",
        ]),
      ]),
    ];
  }
  if (expanded || current) return [];
  return [
    column({ width: "100%", marginTop: 1 }, [
      text({ fg: theme.textMuted, wrapMode: "none" }, [
        `Select a ${ROUTER_PROVIDER} model`,
      ]),
    ]),
  ];
}

/**
 * Click to activate, the same gesture the host's own sidebar rows use. There is
 * deliberately no hover fill: clearing it again would mean setting a prop to
 * `undefined`, and that behaviour is not something the panel can verify about
 * itself. The chevron and the route count carry the affordance instead.
 */
function interactive(node: Element, onActivate: () => void): Element {
  setProp(node, "onMouseUp", () => onActivate());
  return node;
}

/* -------------------------------------------------------------------- state */

/** Live routes, read from the alias inventory the server published. */
function readRoutes(ctx: TuiContext, location: TuiLocation): Route[] {
  const models = ctx.data.location.model.list(location) ?? [];
  return models
    .filter(
      (model) =>
        model.providerID === ROUTER_PROVIDER &&
        typeof model.body?.model === "string",
    )
    .map((model) => ({ agent: model.id, target: String(model.body?.model) }))
    .sort((a, b) => a.agent.localeCompare(b.agent));
}

/**
 * The model in use right now.
 *
 * The prompt's own selection is not exposed to plugins in this OpenCode version
 * — `ui` carries only dialog, toast, format, router, panel, tabs and slot — so a
 * session is read from its own record, which holds the unrouted alias
 * (`model-router/<agent>`) rather than the resolved model. Off a session there
 * is no record, so the primary agent's configured model stands in, since that
 * is what a new session here would start on.
 */
function readSelection(
  ctx: TuiContext,
  location: TuiLocation,
): SelectedModel | undefined {
  const route = ctx.ui.router.current();
  if (route.type === "session") {
    const model = ctx.data.session.get(route.sessionID)?.model;
    return model
      ? { providerID: model.providerID, id: model.id, variant: model.variant }
      : undefined;
  }

  const agents = ctx.data.location.agent.list(location) ?? [];
  const primary = agents.find((agent) => agent.mode === "primary");
  if (!primary?.model) return undefined;
  return { providerID: primary.model.providerID, id: primary.model.id };
}

/** Cheap change detector for the poll loop. */
function stateSignature(ctx: TuiContext): string {
  const route = ctx.ui.router.current();
  const session =
    route.type === "session"
      ? ctx.data.session.get(route.sessionID)
      : undefined;
  const routes = readRoutes(ctx, ctx.location ?? ctx.data.location.default())
    .map((route) => `${route.agent}=${route.target}`)
    .join(",");
  return `${session?.model?.providerID ?? ""}/${session?.model?.id ?? ""}#${routes}`;
}

function readVersion(): string {
  try {
    const raw = readFileSync(
      new URL("../package.json", import.meta.url),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
