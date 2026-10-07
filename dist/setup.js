import { Config } from "./config";
import { detectPresets } from "./presets";
import { ModelStore } from "./model-store";
import { Router } from "./router";
import { probeModel } from "./probe";
import { logger } from "./logger";
import { handleRouterCommand } from "./commands";
const ROUTER_COMMAND = "router";
const reassign = async (ctx, router, session, agents) => {
    return router.assignModels(agents).then(() => {
        if (!session.agent)
            return;
        const newModel = router.cachedAssignments.get(session.agent);
        if (newModel &&
            (newModel?.id !== session.model?.id ||
                newModel?.providerID !== session.model?.providerID)) {
            return ctx.session.switchModel({
                sessionID: session.id,
                model: newModel,
            });
        }
    });
};
export const setup = async (ctx) => {
    await ctx.agent.reload();
    const plugins = await ctx.plugin.list();
    const catalog = await ctx.model.list();
    const detected = detectPresets(plugins.data);
    logger.log(`plugin registry: ${Array.isArray(plugins?.data) ? plugins.data.length : "non-array"} entries` +
        ` -> presets ${JSON.stringify(detected)}`);
    const config = new Config(ctx.options, detected);
    const modelStore = new ModelStore(ctx.storage, config);
    await modelStore.setCatalog(catalog.data);
    const router = new Router(modelStore, config, ctx.storage, (model) => probeModel(model, {
        generate: ctx.generate.text,
        timeoutMs: config.current.probeTimeoutMs,
    }), ctx.agent);
    await router.init();
    let agentReg = await router.assignModels();
    const commandDisposer = await ctx.command.transform((editor) => {
        editor.add({
            name: ROUTER_COMMAND,
            description: "Inspect and steer the model router: status, refresh, pin an agent to a model",
            execute: async (input) => {
                const curSession = await ctx.session.get({
                    sessionID: input.sessionID,
                });
                config.detectedPresets = detectPresets((await ctx.plugin.list()).data);
                return handleRouterCommand(input.prompt.text, {
                    config,
                    modelStore,
                    router,
                    session: curSession,
                    say: async (text) => {
                        try {
                            await ctx.session.synthetic({
                                sessionID: input.sessionID,
                                text: `Print this message as is without quotes:
"""
${text}
"""`,
                            });
                        }
                        catch (error) {
                            logger.error("could not post /router output to the session", error);
                        }
                    },
                    reassign: (agents) => {
                        return reassign(ctx, router, curSession, agents);
                    },
                });
            },
        });
    });
    await ctx.command.reload();
    await ctx.agent.reload();
    // Timer
    const timer = setTimeout(async () => {
        agentReg = await router.assignModels();
    }, config.current.refreshMs);
    // Probe hooks
    await ctx.session.hook("http.request", (req) => {
        req.request.startTime = Date.now();
    });
    await ctx.session.hook("http.response", async (req) => {
        const target = `${req.model.providerID}/${req.model.id}`;
        if (!req.request.startTime)
            return;
        modelStore.recordProbe(target, {
            verdict: req.response.ok ? "ok" : "unusable",
            latencyMs: Date.now() - req.request.startTime,
        });
        if (!req.response.ok) {
            const curSession = await ctx.session.get({ sessionID: req.sessionID });
            if (curSession.agent) {
                void reassign(ctx, router, await ctx.session.get({ sessionID: req.sessionID }), [curSession.agent]);
            }
        }
    });
    await ctx.session.hook("experimental.ws.receive", (req) => {
        const target = `${req.model.providerID}/${req.model.id}`;
        modelStore.recordProbe(target, {
            verdict: "ok",
            latencyMs: 100,
        });
    });
    return async () => {
        await commandDisposer.dispose();
        await agentReg?.dispose();
        if (timer)
            clearTimeout(timer);
    };
};
