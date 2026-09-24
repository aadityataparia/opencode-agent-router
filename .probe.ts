import { Plugin } from "@opencode-ai/plugin";

export const probe = Plugin.define({
  id: "probe",
  setup: async (ctx) => {
    const catalog = await ctx.catalog.model.list();
    const models = catalog.data;
    void models;

    await ctx.agent.transform((agents) => {
      const draft = agents.list()[0];
      if (draft) {
        agents.update(draft.id, (agent) => {
          agent.model = { id: "x", providerID: "y" };
        });
      }
    });
    await ctx.agent.reload();
  },
});
