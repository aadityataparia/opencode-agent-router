import { Context, Plugin } from "@opencode/plugin/promise/plugin";
import { Config } from "./config";
import { detectPresets } from "./presets";
import { ModelStore } from "./model-store";
import { Router } from "./router";
import { probeModel } from "./probe";
import { logger } from "./logger";
import { AgentName, Candidate, routerAgentID } from "./types";
import { Agent, Model, Provider } from "@opencode/client/effect";

const assignModels = async (
  assignments: Map<AgentName, Pick<Candidate, "id" | "providerID"> | undefined>,
  ctxAgent: Context["agent"],
) => {
  await ctxAgent.transform((editor) => {
    let assigned = 0;
    const failed: string[] = [];

    for (const [agentName, ref] of assignments) {
      if (!ref) continue;

      const model = {
        providerID: Provider.ID.make(ref.providerID),
        id: Model.ID.make(ref.id),
      };
      for (const id of [routerAgentID(agentName), agentName]) {
        try {
          editor.update(id, (agent) => {
            agent.id = Agent.ID.make(id);
            agent.name = Agent.Name.make(agentName);
            agent.model = model;
          });
          assigned += 1;
        } catch (error) {
          failed.push(`${id}: ${String(error)}`);
        }
      }
    }
    logger.log(
      `agent transform: ${assigned} applied, for ${assignments.size} role(s)` +
        (failed.length > 0 ? `, failed ${failed.join("; ")}` : ""),
    );
  });
};

export const setup: Plugin["setup"] = async (ctx) => {
  const plugins = await ctx.plugin.list();
  const catalog = await ctx.model.list();

  const config = new Config(ctx.options, detectPresets(plugins.data));
  const modelStore = new ModelStore(ctx.storage, config);

  await modelStore.setCatalog(catalog.data);

  const router = new Router(modelStore, config, ctx.storage);
  await router.init();

  const assignments = await router.getAssignments((model) =>
    probeModel(model, {
      generate: ctx.generate.text,
      timeoutMs: config.current.probeTimeoutMs,
    }),
  );

  await assignModels(assignments, ctx.agent);
};
