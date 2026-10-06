import { Plugin } from "@opencode/plugin/promise/plugin";
import { Config } from "./config";
import { detectPresets } from "./presets";
import { ModelStore } from "./model-store";
import { Router } from "./router";
import { probeModel } from "./probe";
import { logger } from "./logger";
import { handleRouterCommand } from "./commands";

const ROUTER_COMMAND = "router";

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

  await router.assignModels();

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
        });
      },
    });
  });

  await ctx.command.reload();
  await ctx.agent.reload();

  return async () => {
    await commandDisposer.dispose();
  };
};
