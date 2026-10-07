import { Context, Plugin } from "@opencode/plugin/promise/plugin";
import { Config } from "./config";
import { detectPresets } from "./presets";
import { ModelStore } from "./model-store";
import { Router } from "./router";
import { probeModel } from "./probe";
import { logger } from "./logger";
import { handleRouterCommand } from "./commands";
import { SessionInfo } from "@opencode/client";
import { AgentName, ROUTER_AGENT_PREFIX } from "./types";

const ROUTER_COMMAND = "router";

const reassign = async (
  ctx: Context,
  router: Router,
  session: SessionInfo,
  agents?: AgentName[],
) => {
  return router.assignModels(agents).then(() => {
    if (!session.agent) return;
    const newModel = router.cachedAssignments.get(
      session.agent.replace(ROUTER_AGENT_PREFIX, "") as AgentName,
    );
    if (
      newModel &&
      (newModel?.id !== session.model?.id ||
        newModel?.providerID !== session.model?.providerID)
    ) {
      return ctx.session.switchModel({
        sessionID: session.id,
        model: newModel,
      });
    }
  });
};

export const setup: Plugin["setup"] = async (ctx) => {
  await ctx.agent.reload();

  const plugins = await ctx.plugin.list();
  const catalog = await ctx.model.list();

  const detected = detectPresets(plugins.data);
  logger.log(
    `plugin registry: ${Array.isArray(plugins?.data) ? plugins.data.length : "non-array"} entries` +
      ` -> presets ${JSON.stringify(detected)}`,
  );

  const config = new Config(ctx.options, detected);
  const modelStore = new ModelStore(ctx.storage, config);

  await modelStore.setCatalog(catalog.data);

  const router = new Router(
    modelStore,
    config,
    ctx.storage,
    (model) =>
      probeModel(model, {
        generate: ctx.generate.text,
        timeoutMs: config.current.probeTimeoutMs,
      }),
    ctx.agent,
  );
  await router.init();

  let agentReg = await router.assignModels();

  const commandDisposer = await ctx.command.transform((editor) => {
    editor.add({
      name: ROUTER_COMMAND,
      description:
        "Inspect and steer the model router: status, refresh, pin an agent to a model",
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
          say: async (text: string) => {
            try {
              await ctx.session.synthetic({
                sessionID: input.sessionID,
                text: `Print this message as is without quotes:
"""
${text}
"""`,
              });
            } catch (error) {
              logger.error(
                "could not post /router output to the session",
                error,
              );
            }
          },
          reassign: (agents?: AgentName[]) => {
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

    if (!req.request.startTime) return;

    modelStore.recordProbe(target, {
      verdict: req.response.ok ? "ok" : "unusable",
      latencyMs: Date.now() - req.request.startTime,
    });

    if (!req.response.ok) {
      const curSession = await ctx.session.get({ sessionID: req.sessionID });
      if (curSession.agent) {
        void reassign(
          ctx,
          router,
          await ctx.session.get({ sessionID: req.sessionID }),
          [curSession.agent.replace(ROUTER_AGENT_PREFIX, "") as AgentName],
        );
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

  await ctx.session.hook("model.request", async (input) => {
    if (input.model.providerID === "model-router") {
      const curSession = await ctx.session.get({ sessionID: input.sessionID });
      void reassign(ctx, router, curSession, [input.agent as AgentName]);
    }
  });

  return async () => {
    await commandDisposer.dispose();
    await agentReg?.dispose();

    if (timer) clearTimeout(timer);
  };
};
