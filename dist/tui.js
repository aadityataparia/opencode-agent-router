import { appendFileSync, readFileSync } from "node:fs";
import { createElement, insert, setProp } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";
/** Renders the routed agents in the sidebar: reference information, not a task worth a model turn. */
const ROUTER_AGENT_PREFIX = "model-router/";
const LABEL_WIDTH = 14;
const REFRESH_MS = 1_000;
const TRACE = process.env.OPENCODE_AGENT_ROUTER_TRACE;
/** Opt-in breadcrumb for verifying this plugin inside a real TUI. */
function trace(event) {
    if (!TRACE)
        return;
    try {
        appendFileSync(TRACE, `${new Date().toISOString()} ${event}\n`);
    }
    catch {
        // Tracing must never break the sidebar.
    }
}
export const OpenCodeAgentRouterTui = Plugin.define({
    id: "opencode-agent-router.tui",
    setup: (ctx) => {
        const theme = ctx.theme;
        trace(`setup version=${readVersion()}`);
        // Collapsed by default: the one route that matters right now. Expanding is
        // an explicit act, so the sidebar stays quiet during normal work.
        let expanded = false;
        let disposed = false;
        let disposeSlot;
        // The agent list is cached, and the routed agents may not exist yet.
        const AGENT_RESYNC_MS = 5_000;
        let lastResync = 0;
        const resyncAgents = (force = false) => {
            const now = Date.now();
            if (!force && now - lastResync < AGENT_RESYNC_MS)
                return;
            lastResync = now;
            try {
                ctx.data.location.agent.invalidate();
                void ctx.data.location.agent.sync();
            }
            catch (error) {
                trace(`agent resync failed ${String(error)}`);
            }
        };
        const build = () => {
            const location = ctx.location ?? ctx.data.location.default();
            const routes = readRoutes(ctx, location);
            const selected = readSelection(ctx, location);
            // The selection is a real model, so the current route is whichever routed
            // agent currently points at it — not an agent whose id matches it.
            const selectedRef = selected
                ? `${selected.providerID}/${selected.id}`
                : undefined;
            const current = selectedRef
                ? routes.find((route) => route.target === selectedRef)
                : undefined;
            const visible = expanded
                ? [
                    ...(current ? [current] : []),
                    ...routes.filter((route) => route.agent !== current?.agent),
                ]
                : current
                    ? [current]
                    : [];
            trace(`render expanded=${expanded} routes=${routes.length} current=${current?.agent ?? "none"} visible=${visible.length}`);
            return column({
                width: "100%",
                border: "rounded",
                borderColor: theme.borderActive,
                padding: 1,
            }, [
                header(theme, readVersion(), expanded, routes.length, () => {
                    expanded = !expanded;
                    trace(`toggle expanded=${expanded}`);
                    rebuild();
                }),
                ...visible.map((route) => routeRow(theme, route, {
                    current: route.agent === current?.agent,
                    variant: route.agent === current?.agent ? selected?.variant : undefined,
                })),
                ...emptyState(theme, routes, current, expanded),
            ]);
        };
        const claim = () => {
            disposeSlot = ctx.ui.slot({ append: "sidebar.content", render: build });
        };
        // The host exposes no reactive hook for the sidebar's inputs, and a tree
        // this size is cheap to rebuild, so re-claim the slot when state changes.
        const rebuild = () => {
            if (disposed)
                return;
            disposeSlot?.();
            claim();
            ctx.renderer.requestRender();
        };
        // React to the selection event rather than waiting out a poll interval; the
        // rebuild re-reads state, so the event is only a nudge.
        let signature = "";
        const unsubscribe = ctx.data.on("session.model.selected", (event) => {
            trace(`model.selected ${event.data.model.providerID}/${event.data.model.id}`);
            rebuild();
            // Re-seed so the poll does not rebuild the same tree again.
            signature = stateSignature(ctx);
        });
        const timer = setInterval(() => {
            if (readRoutes(ctx, ctx.location ?? ctx.data.location.default()).length === 0) {
                resyncAgents();
            }
            const next = stateSignature(ctx);
            if (next === signature)
                return;
            signature = next;
            trace(`change ${next}`);
            rebuild();
        }, REFRESH_MS);
        claim();
        resyncAgents(true);
        signature = stateSignature(ctx);
        return () => {
            disposed = true;
            clearInterval(timer);
            unsubscribe();
            disposeSlot?.();
        };
    },
});
export default OpenCodeAgentRouterTui;
/* ---------------------------------------------------------------- rendering */
function element(tag, props = {}, children = []) {
    const node = createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value !== undefined)
            setProp(node, key, value);
    }
    for (const child of children) {
        if (child === null || child === undefined || child === false)
            continue;
        insert(node, child);
    }
    return node;
}
const box = (props, children = []) => element("box", props, children);
const text = (props, children) => element("text", props, children);
const column = (props, children) => box({ flexDirection: "column", ...props }, children);
/** `Model Router` badge on the left, plugin version muted on the right. */
function header(theme, version, expanded, count, onToggle) {
    const row = box({
        width: "100%",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    }, [
        box({ paddingRight: 1, backgroundColor: theme.accent }, [
            text({ fg: theme.background }, [
                `${expanded ? "▼" : "▶"} Model Router (${count})`,
            ]),
        ]),
        text({ fg: theme.textMuted, wrapMode: "none" }, [`v${version}`]),
    ]);
    return interactive(row, onToggle);
}
function routeRow(theme, route, options) {
    const fg = options.current ? theme.text : theme.textMuted;
    const marker = options.current ? "• " : "  ";
    return box({
        width: "100%",
        flexDirection: "column",
        justifyContent: "space-between",
        shouldFill: true,
    }, [
        text({ fg, wrapMode: "none", truncate: true, flexShrink: 1 }, [
            `${marker}${route.agent}`,
        ]),
        text({
            fg: theme.textMuted,
            wrapMode: "none",
            truncate: true,
            flexShrink: 1,
            textAlign: "right",
        }, [
            "↳ " +
                (options.variant
                    ? `${route.target} (${options.variant})`
                    : route.target),
        ]),
    ]);
}
function emptyState(theme, routes, current, expanded) {
    if (routes.length === 0) {
        return [
            column({ width: "100%", marginTop: 1 }, [
                text({ fg: theme.textMuted, wrapMode: "none" }, [
                    "No routes published",
                ]),
            ]),
        ];
    }
    if (expanded || current)
        return [];
    return [
        column({ width: "100%", marginTop: 1 }, [
            text({ fg: theme.textMuted, wrapMode: "none" }, [
                "Not on a routed model",
            ]),
        ]),
    ];
}
/** Click to activate, like the host's sidebar rows. No hover fill: clearing it means setting a prop to `undefined`. */
function interactive(node, onActivate) {
    setProp(node, "onMouseUp", () => onActivate());
    return node;
}
/* -------------------------------------------------------------------- state */
/** Live routes, read from the agents the server maintains. An agent with no model is not a route yet. */
function readRoutes(ctx, location) {
    const agents = ctx.data.location.agent.list(location) ?? [];
    const routes = [];
    for (const agent of agents) {
        if (!agent.id.startsWith(ROUTER_AGENT_PREFIX))
            continue;
        const model = agent.model;
        if (!model)
            continue;
        routes.push({
            agent: agent.id.slice(ROUTER_AGENT_PREFIX.length),
            target: `${model.providerID}/${model.id}`,
        });
    }
    return routes.sort((a, b) => a.agent.localeCompare(b.agent));
}
/** The model in use now: from the session record, or the primary agent's model off a session. */
function readSelection(ctx, location) {
    const route = ctx.ui.router.current();
    if (route.type === "session") {
        const model = ctx.data.session.get(route.sessionID)?.model;
        return model
            ? { providerID: model.providerID, id: model.id, variant: model.variant }
            : undefined;
    }
    const agents = ctx.data.location.agent.list(location) ?? [];
    const primary = agents.find((agent) => agent.mode === "primary");
    if (!primary?.model)
        return undefined;
    return { providerID: primary.model.providerID, id: primary.model.id };
}
/** Change detector for the poll loop, from the same reads `build` performs. */
function stateSignature(ctx) {
    const location = ctx.location ?? ctx.data.location.default();
    const selected = readSelection(ctx, location);
    const routes = readRoutes(ctx, location)
        .map((route) => `${route.agent}=${route.target}`)
        .join(",");
    const selection = [
        selected?.providerID ?? "",
        selected?.id ?? "",
        selected?.variant ?? "",
    ].join("/");
    return `${selection}#${routes}`;
}
function readVersion() {
    try {
        const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
        const parsed = JSON.parse(raw);
        return parsed.version ?? "0.0.0";
    }
    catch {
        return "0.0.0";
    }
}
