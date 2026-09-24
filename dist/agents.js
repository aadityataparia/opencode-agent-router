const COMMON_AGENTS = {
    architect: {
        // Master delegator and strategic coordinator.
        // Needs planning, judgment, instruction-following,
        // reconciliation and verification.
        categories: ["reasoning", "coding", "long-context", "general"],
        weights: {
            reasoning: 1.0,
            coding: 0.8,
            "long-context": 0.9,
            general: 0.4,
        },
        minContext: 100000,
        reasoning: true,
        tools: true,
        healthWeight: 0.3,
        latencyWeight: 0.05,
        costWeight: 0.0,
        contextWeight: 0.2,
    },
    coder: {
        // Fast implementation specialist.
        // Receives concrete/bounded instructions from Orchestrator.
        categories: ["coding", "fast", "cheap", "general"],
        weights: {
            coding: 1.0,
            fast: 0.9,
            cheap: 0.8,
            general: 0.3,
        },
        minContext: 32000,
        tools: true,
        healthWeight: 0.2,
        latencyWeight: 0.3,
        costWeight: 0.3,
        contextWeight: 0.05,
    },
    vision: {
        // Optional visual-analysis specialist.
        //
        // Specifically intended for images, screenshots, PDFs
        // and diagrams when the Orchestrator is not multimodal.
        categories: ["vision", "long-context", "fast", "general"],
        weights: {
            vision: 1.0,
            "long-context": 0.65,
            fast: 0.6,
            general: 0.2,
        },
        minContext: 32000,
        vision: true,
        tools: true,
        healthWeight: 0.2,
        latencyWeight: 0.15,
        costWeight: 0.1,
        contextWeight: 0.1,
    },
};
export const AGENT_REQUIREMENTS = {
    sisyphus: COMMON_AGENTS.architect,
    hephaestus: {
        categories: ["coding", "reasoning", "general"],
        weights: { coding: 1.0, reasoning: 0.9, general: 0.4 },
        minContext: 64000,
        reasoning: true,
        tools: true,
        healthWeight: 0.2,
        latencyWeight: 0.1,
        costWeight: 0.05,
        contextWeight: 0.1,
    },
    prometheus: {
        categories: ["reasoning", "long-context", "general"],
        weights: { reasoning: 1.0, "long-context": 0.95, general: 0.3 },
        minContext: 100_000,
        reasoning: true,
        tools: true,
        healthWeight: 0.2,
        latencyWeight: 0.05,
        costWeight: 0.05,
        contextWeight: 0.15,
    },
    atlas: {
        categories: ["coding", "reasoning", "general"],
        weights: { coding: 1.0, reasoning: 0.85, general: 0.4 },
        minContext: 64000,
        reasoning: true,
        tools: true,
        healthWeight: 0.2,
        latencyWeight: 0.1,
        costWeight: 0.05,
        contextWeight: 0.1,
    },
    // oracle: {
    //   categories: ["reasoning", "coding", "long-context"],
    //   weights: { reasoning: 1.0, coding: 0.7, "long-context": 0.8 },
    //   minContext: 100_000,
    //   reasoning: true,
    //   tools: true,
    //   healthWeight: 0.3,
    //   latencyWeight: 0.05,
    //   costWeight: 0,
    //   contextWeight: 0.15,
    // },
    // librarian: {
    //   categories: ["long-context", "fast", "general"],
    //   weights: { "long-context": 1.0, fast: 0.9, general: 0.4 },
    //   minContext: 100_000,
    //   tools: true,
    //   healthWeight: 0.2,
    //   latencyWeight: 0.2,
    //   costWeight: 0.15,
    //   contextWeight: 0.15,
    // },
    explore: {
        categories: ["fast", "coding", "general"],
        weights: { fast: 1.0, coding: 0.8, general: 0.4 },
        minContext: 32000,
        tools: true,
        healthWeight: 0.15,
        latencyWeight: 0.4,
        costWeight: 0.2,
        contextWeight: 0.05,
    },
    "multimodal-looker": {
        categories: ["vision", "reasoning", "general"],
        weights: { vision: 1.0, reasoning: 0.7, general: 0.2 },
        vision: true,
        minContext: 32000,
        tools: true,
        healthWeight: 0.2,
        latencyWeight: 0.1,
        costWeight: 0.05,
        contextWeight: 0.05,
    },
    metis: {
        categories: ["reasoning", "long-context", "general"],
        weights: { reasoning: 1.0, "long-context": 0.8, general: 0.3 },
        minContext: 100000,
        reasoning: true,
        tools: true,
        healthWeight: 0.25,
        latencyWeight: 0.05,
        costWeight: 0,
        contextWeight: 0.15,
    },
    momus: {
        categories: ["reasoning", "coding", "long-context"],
        weights: { reasoning: 1.0, coding: 0.7, "long-context": 0.8 },
        minContext: 100000,
        reasoning: true,
        tools: true,
        healthWeight: 0.3,
        latencyWeight: 0.05,
        costWeight: 0,
        contextWeight: 0.15,
    },
    "sisyphus-junior": {
        categories: ["coding", "fast", "cheap", "general"],
        weights: { coding: 0.8, fast: 1.0, cheap: 1.0, general: 0.4 },
        minContext: 32000,
        tools: true,
        healthWeight: 0.15,
        latencyWeight: 0.3,
        costWeight: 0.4,
        contextWeight: 0.05,
    },
    orchestrator: COMMON_AGENTS.architect,
    explorer: {
        // Broad codebase reconnaissance.
        // Speed and efficiency matter more than maximum reasoning.
        categories: ["fast", "coding", "cheap", "general"],
        weights: {
            fast: 1.0,
            coding: 0.8,
            cheap: 0.9,
            general: 0.3,
        },
        minContext: 100_000,
        tools: true,
        healthWeight: 0.15,
        latencyWeight: 0.45,
        costWeight: 0.35,
        contextWeight: 0.05,
    },
    oracle: {
        // Strategic architecture advisor and debugger of last resort.
        // Strongest reasoning is the primary requirement.
        categories: ["reasoning", "coding", "long-context"],
        weights: {
            reasoning: 1.0,
            coding: 0.8,
            "long-context": 0.95,
        },
        minContext: 100000,
        reasoning: true,
        tools: true,
        healthWeight: 0.3,
        latencyWeight: 0.02,
        costWeight: 0.0,
        contextWeight: 0.2,
    },
    council: {
        // Multi-LLM consensus and synthesis.
        //
        // Important: Council itself should use a strong synthesis
        // model. The individual councillors are handled separately
        // by Council's own configuration and should be diverse.
        categories: ["reasoning", "long-context", "coding"],
        weights: {
            reasoning: 1.0,
            "long-context": 0.95,
            coding: 0.65,
        },
        minContext: 100000,
        reasoning: true,
        tools: true,
        healthWeight: 0.3,
        latencyWeight: 0.0,
        costWeight: 0.0,
        contextWeight: 0.2,
    },
    librarian: {
        // External knowledge retrieval, documentation and research.
        // Explicitly optimized for fast/low-cost models.
        categories: ["fast", "long-context", "reasoning", "general"],
        weights: {
            fast: 1.0,
            "long-context": 0.75,
            reasoning: 0.55,
            general: 0.3,
        },
        minContext: 64000,
        tools: true,
        healthWeight: 0.15,
        latencyWeight: 0.35,
        costWeight: 0.35,
        contextWeight: 0.1,
    },
    designer: {
        // UI/UX implementation and visual excellence.
        //
        // Strong frontend/coding ability is more important than
        // generic reasoning. Vision is a useful bonus, not a
        // mandatory capability.
        categories: ["coding", "vision", "reasoning", "general"],
        weights: {
            coding: 1.0,
            vision: 0.85,
            reasoning: 0.65,
            general: 0.3,
        },
        minContext: 64000,
        tools: true,
        // Deliberately NOT: vision: true
        // A model can be excellent at UI implementation without
        // accepting image input.
        healthWeight: 0.2,
        latencyWeight: 0.1,
        costWeight: 0.05,
        contextWeight: 0.1,
    },
    fixer: COMMON_AGENTS.coder,
    observer: COMMON_AGENTS.vision,
    // others
    coder: COMMON_AGENTS.coder,
    architect: COMMON_AGENTS.architect,
    visual: COMMON_AGENTS.vision,
};
