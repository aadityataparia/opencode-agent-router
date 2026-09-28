import type { AgentName, AgentRequirements } from "./types";

const COMMON_AGENTS = {
  architect: {
    // Master delegator and strategic coordinator.

    weights: {
      cheap: 0.01,
      fast: 0.5,
      reasoning: 1.0,
      coding: 0.8,
      "long-context": 0.9,
      general: 0.4,
    },

    minContext: 100000,
    tools: true,
  },
  coder: {
    // Fast implementation specialist.
    // Receives concrete/bounded instructions from Orchestrator.

    weights: {
      "long-context": 0.05,
      coding: 1.0,
      fast: 0.9,
      cheap: 0.8,
      general: 0.3,
    },

    minContext: 32000,
    tools: true,
  },
  vision: {
    // Optional visual-analysis specialist, for when the orchestrator is not multimodal.

    weights: {
      cheap: 0.2,
      vision: 1.0,
      "long-context": 0.65,
      fast: 0.6,
      general: 0.2,
    },

    minContext: 32000,
    tools: true,
  },
} as const satisfies Record<string, AgentRequirements>;

export const AGENT_REQUIREMENTS: Record<AgentName, AgentRequirements> = {
  sisyphus: COMMON_AGENTS.architect,
  hephaestus: {
    weights: { coding: 1.0, reasoning: 0.9, general: 0.4, cheap: 0.01 },
    minContext: 64000,
    tools: true,
  },
  prometheus: {
    weights: {
      reasoning: 1.0,
      "long-context": 0.95,
      general: 0.3,
      cheap: 0.01,
    },
    minContext: 100_000,
    tools: true,
  },
  atlas: {
    weights: { coding: 1.0, reasoning: 0.85, general: 0.4, cheap: 0.01 },
    minContext: 64000,
    tools: true,
  },
  explore: {
    weights: { fast: 1.0, coding: 0.8, general: 0.4, cheap: 0.01 },
    minContext: 32000,
    tools: true,
  },
  "multimodal-looker": {
    weights: {
      vision: 1.0,
      reasoning: 0.7,
      general: 0.2,
      fast: 0.1,
      cheap: 0.05,
      "long-context": 0.05,
    },
    minContext: 32000,
    tools: true,
  },
  metis: {
    weights: { reasoning: 1.0, "long-context": 0.8, general: 0.3, cheap: 0.01 },
    minContext: 100000,
    tools: true,
  },
  momus: {
    weights: { reasoning: 1.0, coding: 0.7, "long-context": 0.8, cheap: 0.01 },
    minContext: 100000,
    tools: true,
  },
  councillor: {
    // A council member: reason well and dissent usefully, but unlike the
    // council it should not be the most expensive model available.

    weights: {
      cheap: 0.1,
      fast: 0.1,
      reasoning: 1.0,
      "long-context": 0.85,
      coding: 0.6,
    },

    minContext: 100000,
    tools: true,
  },
  "sisyphus-junior": {
    weights: {
      coding: 0.8,
      fast: 1.0,
      cheap: 1.0,
      general: 0.4,
      "long-context": 0.05,
    },
    minContext: 32000,
    tools: true,
  },
  orchestrator: COMMON_AGENTS.architect,

  explorer: {
    // Broad codebase reconnaissance.
    // Speed and efficiency matter more than maximum reasoning.

    weights: {
      "long-context": 0.05,
      fast: 1.0,
      coding: 0.8,
      cheap: 0.9,
      general: 0.3,
    },

    minContext: 100_000,
    tools: true,
  },

  oracle: {
    // Strategic architecture advisor and debugger of last resort.
    // Strongest reasoning is the primary requirement.

    weights: {
      reasoning: 1.0,
      coding: 0.8,
      "long-context": 0.95,
      cheap: 0.01,
    },

    minContext: 100000,
    tools: true,
  },

  council: {
    // Multi-LLM consensus and synthesis. Council itself wants a strong
    // synthesis model; its councillors are configured separately.

    weights: {
      cheap: 0.01,
      fast: 0.0,
      reasoning: 1.0,
      "long-context": 0.95,
      coding: 0.65,
    },

    minContext: 100000,
    tools: true,
  },

  librarian: {
    // External knowledge retrieval, documentation and research.
    // Explicitly optimized for fast/low-cost models.

    weights: {
      cheap: 0.35,
      fast: 1.0,
      "long-context": 0.75,
      reasoning: 0.55,
      general: 0.3,
    },

    minContext: 64000,
    tools: true,
  },

  designer: {
    // UI/UX implementation. Frontend/coding ability matters more than generic
    // reasoning; vision is a bonus, not a requirement.

    weights: {
      "long-context": 0.1,
      cheap: 0.05,
      fast: 0.1,
      coding: 1.0,
      vision: 0.85,
      reasoning: 0.65,
      general: 0.3,
    },

    minContext: 64000,
    tools: true,

    // Deliberately not vision: a model can be excellent at UI without image input.
  },
  fixer: COMMON_AGENTS.coder,
  observer: COMMON_AGENTS.vision,
  // others
  coder: COMMON_AGENTS.coder,
  architect: COMMON_AGENTS.architect,
  visual: COMMON_AGENTS.vision,
};
