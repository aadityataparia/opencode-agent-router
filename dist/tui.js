import { appendFileSync } from "node:fs";
import { Plugin } from "@opencode/plugin/tui";
const TRACE = "/private/var/folders/0g/2l9ghq956_116f7v7j53c1_m0000gn/T/opencode/router-tui-trace.log";
function trace(event) {
    try {
        appendFileSync(TRACE, `${new Date().toISOString()} ${event}\n`);
    }
    catch { }
}
/**
 * Terminal-side companion to the server plugin. The router itself runs on the
 * server; this only reads the aliases the server published and renders the
 * route for the model the user currently has selected.
 *
 * Rendering here rather than through a server command matters: OpenCode starts
 * a model turn for every server command, which would spend a request to
 * restate a table the terminal can draw for free.
 */
const ROUTER_PROVIDER = "model-router";
const OPENCODE_PROVIDER = "opencode";
const ROUTER_COMMAND = "routed-models";
export const OpenCodeAgentRouterTui = Plugin.define({
    id: "opencode-agent-router.tui",
    setup: (ctx) => {
        trace(`setup pid=${process.pid}`);
        // A keymap layer is owned by a component: the keymap context only exists
        // inside a rendered slot, so creating one directly in setup fails with
        // "Keymap.Provider is missing". Claiming the `app` slot gives the layer a
        // component to live in for as long as the TUI runs.
        return ctx.ui.slot({
            append: "app",
            render: () => {
                trace("render app slot");
                // TEMPORARY probe: two layers so one run reveals both whether the app
                // slot renders at all and which mode the prompt can actually reach.
                ctx.keymap.layer(() => ({
                    priority: 10,
                    mode: "global",
                    commands: [
                        {
                            id: "opencode-agent-router.routed-models",
                            title: "Show where the selected model routes",
                            description: "Reads the current selection; makes no model request.",
                            group: "Model Router",
                            slash: { name: ROUTER_COMMAND },
                            run: () => {
                                trace("fired global");
                                void report(ctx);
                            },
                        },
                    ],
                }));
                ctx.keymap.layer(() => ({
                    priority: 10,
                    commands: [
                        {
                            id: "opencode-agent-router.routed-models-default",
                            title: "Show where the selected model routes (default mode)",
                            description: "Probe.",
                            group: "Model Router",
                            slash: { name: "routed-models-default" },
                            run: () => {
                                trace("fired default");
                                void report(ctx);
                            },
                        },
                    ],
                }));
                return null;
            },
        });
    },
});
export default OpenCodeAgentRouterTui;
/**
 * The prompt's selected model. `ui.model` is the documented TUI accessor but
 * is not in the installed `@opencode/plugin` types yet, so read it
 * defensively and fall back to the session's own model selection.
 */
function currentSelection(ctx) {
    const ui = ctx.ui;
    trace(`probe ui.keys=${Object.keys(ctx.ui).join(",")}`);
    trace(`probe ui.model typeof=${typeof ui.model} keys=${Object.keys(ui.model ?? {}).join(",")}`);
    try {
        trace(`probe ui.model.current=${JSON.stringify(ui.model?.current?.())}`);
    }
    catch (error) {
        trace(`probe ui.model.current threw=${String(error)}`);
    }
    const route = ctx.ui.router.current();
    trace(`probe router.current=${JSON.stringify(route)}`);
    if (route.type !== "session") {
        try {
            const recent = ctx.data.session
                .list()
                .slice(0, 3)
                .map((s) => ({ id: s.id, model: s.model, agent: s.agent }));
            trace(`probe session.list=${JSON.stringify(recent)}`);
        }
        catch (error) {
            trace(`probe session.list threw=${String(error)}`);
        }
        return undefined;
    }
    const model = ctx.data.session.get(route.sessionID)?.model;
    trace(`probe session.model=${JSON.stringify(model)}`);
    return model;
}
async function report(ctx) {
    const location = ctx.location ?? ctx.data.location.default();
    const selected = currentSelection(ctx);
    trace(`report location=${JSON.stringify(location)} selected=${JSON.stringify(selected)}`);
    if (!selected) {
        ctx.ui.toast.show({
            title: "No model selected",
            message: "Select a model in the prompt, then run /routed-models again.",
            variant: "warning",
            duration: 6_000,
        });
        return;
    }
    const label = `${selected.providerID}/${selected.id}`;
    let models = ctx.data.location.model.list(location) ?? [];
    let match = models.find((model) => model.providerID === selected.providerID && model.id === selected.id);
    // A miss usually means the list predates the router's latest refresh.
    if (!match) {
        await ctx.data.location.model.sync(location);
        models = ctx.data.location.model.list(location) ?? [];
        match = models.find((model) => model.providerID === selected.providerID && model.id === selected.id);
    }
    // The router stores the target model id, not a full reference, so resolve
    // the provider it is forwarded to instead of assuming one.
    const targetID = match?.body?.model;
    if (selected.providerID !== ROUTER_PROVIDER || typeof targetID !== "string") {
        ctx.ui.toast.show({
            title: label,
            message: `is not a Model Router alias. Select a ${ROUTER_PROVIDER}/<agent> model to see its route.`,
            variant: "warning",
            duration: 6_000,
        });
        return;
    }
    const target = models.find((model) => model.providerID === OPENCODE_PROVIDER && model.id === targetID);
    const targetLabel = target ? `${OPENCODE_PROVIDER}/${targetID}` : targetID;
    trace(`toast ${ROUTER_PROVIDER}/${selected.id} -> ${targetLabel}`);
    ctx.ui.toast.show({
        title: `${ROUTER_PROVIDER}/${selected.id}`,
        message: `routes to ${targetLabel}`,
        variant: "info",
        duration: 6_000,
    });
}
