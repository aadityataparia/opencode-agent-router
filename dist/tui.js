import { Plugin } from "@opencode/plugin/tui";
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
        ctx.keymap.layer(() => ({
            mode: "global",
            priority: 10,
            commands: [
                {
                    id: "opencode-agent-router.routed-models",
                    title: "Show where the selected model routes",
                    description: "Reads the current selection; makes no model request.",
                    group: "Model Router",
                    slash: { name: ROUTER_COMMAND },
                    run: () => {
                        void report(ctx);
                    },
                },
            ],
        }));
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
    const fromPrompt = ui.model?.current?.();
    if (fromPrompt)
        return fromPrompt;
    const route = ctx.ui.router.current();
    if (route.type !== "session")
        return undefined;
    return ctx.data.session.get(route.sessionID)?.model;
}
async function report(ctx) {
    const location = ctx.location ?? ctx.data.location.default();
    const selected = currentSelection(ctx);
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
    ctx.ui.toast.show({
        title: `${ROUTER_PROVIDER}/${selected.id}`,
        message: `routes to ${targetLabel}`,
        variant: "info",
        duration: 6_000,
    });
}
