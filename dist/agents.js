const COMMON_AGENTS = {
    architect: {
        // Master delegator and strategic coordinator.
        weights: {
            reasoning: 1.0,
            coding: 0.8,
            "long-context": 0.9,
            general: 0.4,
        },
        minContext: 100000,
        reasoning: true,
        tools: true,
        latencyWeight: 0.05,
        costWeight: 0.0,
        contextWeight: 0.2,
    },
    coder: {
        // Fast implementation specialist.
        // Receives concrete/bounded instructions from Orchestrator.
        weights: {
            coding: 1.0,
            fast: 0.9,
            cheap: 0.8,
            general: 0.3,
        },
        minContext: 32000,
        tools: true,
        latencyWeight: 0.3,
        costWeight: 0.3,
        contextWeight: 0.05,
    },
    vision: {
        // Optional visual-analysis specialist, for when the orchestrator is not multimodal.
        weights: {
            vision: 1.0,
            "long-context": 0.65,
            fast: 0.6,
            general: 0.2,
        },
        minContext: 32000,
        vision: true,
        tools: true,
        latencyWeight: 0.15,
        costWeight: 0.1,
        contextWeight: 0.1,
    },
};
export const AGENT_REQUIREMENTS = {
    sisyphus: COMMON_AGENTS.architect,
    hephaestus: {
        weights: { coding: 1.0, reasoning: 0.9, general: 0.4 },
        minContext: 64000,
        reasoning: true,
        tools: true,
        latencyWeight: 0.1,
        costWeight: 0.05,
        contextWeight: 0.1,
    },
    prometheus: {
        weights: { reasoning: 1.0, "long-context": 0.95, general: 0.3 },
        minContext: 100_000,
        reasoning: true,
        tools: true,
        latencyWeight: 0.05,
        costWeight: 0.05,
        contextWeight: 0.15,
    },
    atlas: {
        weights: { coding: 1.0, reasoning: 0.85, general: 0.4 },
        minContext: 64000,
        reasoning: true,
        tools: true,
        latencyWeight: 0.1,
        costWeight: 0.05,
        contextWeight: 0.1,
    },
    explore: {
        weights: { fast: 1.0, coding: 0.8, general: 0.4 },
        minContext: 32000,
        tools: true,
        latencyWeight: 0.4,
        costWeight: 0.2,
        contextWeight: 0.05,
    },
    "multimodal-looker": {
        weights: { vision: 1.0, reasoning: 0.7, general: 0.2 },
        vision: true,
        minContext: 32000,
        tools: true,
        latencyWeight: 0.1,
        costWeight: 0.05,
        contextWeight: 0.05,
    },
    metis: {
        weights: { reasoning: 1.0, "long-context": 0.8, general: 0.3 },
        minContext: 100000,
        reasoning: true,
        tools: true,
        latencyWeight: 0.05,
        costWeight: 0,
        contextWeight: 0.15,
    },
    momus: {
        weights: { reasoning: 1.0, coding: 0.7, "long-context": 0.8 },
        minContext: 100000,
        reasoning: true,
        tools: true,
        latencyWeight: 0.05,
        costWeight: 0,
        contextWeight: 0.15,
    },
    councillor: {
        // A council member: reason well and dissent usefully, but unlike the
        // council it should not be the most expensive model available.
        weights: {
            reasoning: 1.0,
            "long-context": 0.85,
            coding: 0.6,
        },
        minContext: 100000,
        reasoning: true,
        tools: true,
        latencyWeight: 0.1,
        costWeight: 0.1,
        contextWeight: 0.15,
    },
    "sisyphus-junior": {
        weights: { coding: 0.8, fast: 1.0, cheap: 1.0, general: 0.4 },
        minContext: 32000,
        tools: true,
        latencyWeight: 0.3,
        costWeight: 0.4,
        contextWeight: 0.05,
    },
    orchestrator: COMMON_AGENTS.architect,
    explorer: {
        // Broad codebase reconnaissance.
        // Speed and efficiency matter more than maximum reasoning.
        weights: {
            fast: 1.0,
            coding: 0.8,
            cheap: 0.9,
            general: 0.3,
        },
        minContext: 100_000,
        tools: true,
        latencyWeight: 0.45,
        costWeight: 0.35,
        contextWeight: 0.05,
    },
    oracle: {
        // Strategic architecture advisor and debugger of last resort.
        // Strongest reasoning is the primary requirement.
        weights: {
            reasoning: 1.0,
            coding: 0.8,
            "long-context": 0.95,
        },
        minContext: 100000,
        reasoning: true,
        tools: true,
        latencyWeight: 0.02,
        costWeight: 0.0,
        contextWeight: 0.2,
    },
    council: {
        // Multi-LLM consensus and synthesis. Council itself wants a strong
        // synthesis model; its councillors are configured separately.
        weights: {
            reasoning: 1.0,
            "long-context": 0.95,
            coding: 0.65,
        },
        minContext: 100000,
        reasoning: true,
        tools: true,
        latencyWeight: 0.0,
        costWeight: 0.0,
        contextWeight: 0.2,
    },
    librarian: {
        // External knowledge retrieval, documentation and research.
        // Explicitly optimized for fast/low-cost models.
        weights: {
            fast: 1.0,
            "long-context": 0.75,
            reasoning: 0.55,
            general: 0.3,
        },
        minContext: 64000,
        tools: true,
        latencyWeight: 0.35,
        costWeight: 0.35,
        contextWeight: 0.1,
    },
    designer: {
        // UI/UX implementation. Frontend/coding ability matters more than generic
        // reasoning; vision is a bonus, not a requirement.
        weights: {
            coding: 1.0,
            vision: 0.85,
            reasoning: 0.65,
            general: 0.3,
        },
        minContext: 64000,
        tools: true,
        // Deliberately not vision: a model can be excellent at UI without image input.
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
