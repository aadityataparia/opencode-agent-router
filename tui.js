import { t as logger } from "./chunks/logger-BB4yfKgq.js";
import { readFileSync } from "node:fs";
import { createElement, insert, setProp } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";
//#region src/tui.ts
/** Renders the routed agents in the sidebar: reference information, not a task worth a model turn. */
var ROUTER_AGENT_PREFIX = "model-router/";
var REFRESH_MS = 5e3;
var OpenCodeAgentRouterTui = Plugin.define({
	id: "opencode-agent-router.tui",
	setup: (ctx) => {
		const theme = ctx.theme;
		logger.trace(`setup version=${readVersion()}`);
		let expanded = false;
		let disposed = false;
		let disposeSlot;
		let routes = [];
		const refreshRoutes = async () => {
			try {
				const agents = (await ctx.client.agent.list({})).data ?? [];
				routes = toRoutes(agents);
				logger.trace(`agent.list total=${agents.length} routed=${routes.length} ids=${agents.map((a) => a.id).join("|")}, models=${agents.map((a) => a.model?.providerID + "/" + a.model?.id).join("|")}`);
			} catch (error) {
				logger.trace(`agent.list failed ${String(error)}`);
			}
		};
		const build = () => {
			const selected = readSelection(ctx, ctx.location ?? ctx.data.location.default());
			const current = selected?.agent ? routes.find((route) => route.agent === selected.agent) : void 0;
			const visible = expanded ? [...current ? [current] : [], ...routes.filter((route) => route.agent !== current?.agent)] : [current].filter((x) => !!x);
			logger.trace(`render expanded=${expanded} routes=${routes.length} current=${current?.agent ?? "none"} visible=${visible.length}`);
			return column({
				width: "100%",
				border: "rounded"
			}, [
				header(theme, readVersion(), expanded, routes.length, () => {
					expanded = !expanded;
					logger.trace(`toggle expanded=${expanded}`);
					rebuild();
				}),
				...visible.map((route) => routeRow(theme, route, {
					current: route.agent === current?.agent,
					currentModel: selected?.target,
					variant: route.agent === current?.agent ? selected?.variant : void 0
				})),
				...emptyState(theme, routes, current, expanded)
			]);
		};
		const rebuild = () => {
			if (disposed) return;
			disposeSlot?.();
			disposeSlot = ctx.ui.slot({
				append: "sidebar.content",
				render: build
			});
			ctx.renderer.requestRender();
		};
		let signature = "";
		const onChange = (label) => {
			logger.trace(label);
			refreshRoutes().then(() => {
				rebuild();
				signature = stateSignature(ctx, routes);
			});
		};
		const unsubscribeAgent = ctx.data.on("agent.updated", () => onChange("agent.updated"));
		const unsubscribe = ctx.data.on("session.model.selected", (event) => {
			onChange(`model.selected ${event.data.model.providerID}/${event.data.model.id}`);
		});
		const timer = setInterval(() => {
			refreshRoutes().then(() => {
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
	}
});
function element(tag, props, children = []) {
	const node = createElement(tag);
	for (const [key, value] of Object.entries(props)) if (value !== void 0) setProp(node, key, value);
	for (const child of children) {
		if (child === null || child === void 0 || child === false) continue;
		insert(node, child);
	}
	return node;
}
var box = (props, children = []) => element("box", props, children);
var text = (props, children) => element("text", props, children);
var column = (props, children) => box({
	flexDirection: "column",
	...props
}, children);
/** `Model Router` badge on the left, plugin version muted on the right. */
function header(theme, version, expanded, count, onToggle) {
	const row = box({
		width: "100%",
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center"
	}, [box({
		paddingRight: 1,
		backgroundColor: theme.background.raised.base
	}, [text({
		fg: theme.text.base,
		fontWeight: "bold"
	}, [`${expanded ? "▼" : "▶"} Model Router (${count})`])]), text({
		fg: theme.text.muted,
		wrapMode: "none"
	}, [`v${version}`])]);
	setProp(row, "onMouseUp", onToggle);
	return row;
}
function routeRow(theme, route, options) {
	const fg = options.current && options.currentModel ? theme.text.feedback.success.base : theme.text.base;
	const marker = options.current ? "• " : "  ";
	const model = options.current ? options.currentModel : route.target;
	return box({
		width: "100%",
		flexDirection: "column",
		justifyContent: "space-between",
		shouldFill: true
	}, [text({
		fg,
		wrapMode: "none",
		truncate: true,
		flexShrink: 1
	}, [`${marker}${route.agent}${options.current && route.target !== options.currentModel ? " (Manual)" : ""}`]), text({
		fg: options.current && options.currentModel ? theme.text.base : theme.text.muted,
		wrapMode: "none",
		truncate: true,
		flexShrink: 1,
		textAlign: "right"
	}, ["  ↳ " + (options.variant ? `${model} (${options.variant})` : model)])]);
}
function emptyState(theme, routes, current, expanded) {
	if (routes.length === 0) return [column({
		width: "100%",
		marginTop: 1
	}, [text({
		fg: theme.text.muted,
		wrapMode: "none"
	}, ["No routes published"])])];
	if (expanded || current) return [];
	return [column({
		width: "100%",
		marginTop: 1
	}, [text({
		fg: theme.text.muted,
		wrapMode: "none"
	}, ["Not on a routed model"])])];
}
/** Live routes, read from the agents the server maintains. An agent with no model is not a route yet. */
function toRoutes(agents) {
	const routes = [];
	for (const agent of agents) {
		if (!agent.id.startsWith(ROUTER_AGENT_PREFIX)) continue;
		const model = agent.model;
		routes.push({
			agent: agent.id.slice(13),
			target: model ? `${model.providerID}/${model.id}` : "no usable model"
		});
	}
	return routes.sort((a, b) => a.agent.localeCompare(b.agent));
}
/** The model in use now: from the session record, or the primary agent's model off a session. */
function readSelection(ctx, location) {
	try {
		const route = ctx.ui.router.current();
		if (route.type === "session") {
			const agent = ctx.data.session.get(route.sessionID)?.agent?.replace(ROUTER_AGENT_PREFIX, "");
			const model = ctx.data.session.get(route.sessionID)?.model;
			return model ? {
				providerID: model.providerID,
				id: model.id,
				variant: model.variant,
				target: `${model.providerID}/${model.id}`,
				agent
			} : void 0;
		}
		const primary = (ctx.data.location.agent.list(location) ?? []).find((agent) => agent.mode === "primary");
		if (!primary?.model) return void 0;
		return {
			providerID: primary.model.providerID,
			target: `${primary.model.providerID}/${primary.model.id}`,
			id: primary.model.id,
			agent: primary.id
		};
	} catch {
		return;
	}
}
/** Change detector for the poll loop, from the same reads `build` performs. */
function stateSignature(ctx, routes) {
	const selected = readSelection(ctx, ctx.location ?? ctx.data.location.default());
	const assigned = routes.map((route) => `${route.agent}=${route.target ?? ""}`).join(",");
	return `${[
		selected?.providerID ?? "",
		selected?.id ?? "",
		selected?.variant ?? ""
	].join("/")}#${assigned}`;
}
function readVersion() {
	try {
		const raw = readFileSync(new URL("./package.json", import.meta.url), "utf8");
		return JSON.parse(raw).version ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
}
//#endregion
export { OpenCodeAgentRouterTui, OpenCodeAgentRouterTui as default };
