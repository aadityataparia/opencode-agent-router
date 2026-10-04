export const PRESET_NAMES = [
    "oh-my-opencode",
    "oh-my-openagent",
    "oh-my-opencode-slim",
];
/**
 * Agent id prefix the router owns; each role's `model` is kept pointed at
 * whichever real model wins routing.
 */
export const ROUTER_AGENT_PREFIX = "model-router/";
/** The router-owned agent id for a managed role. */
export function routerAgentID(agent) {
    return `${ROUTER_AGENT_PREFIX}${agent}`;
}
const OMO_AGENT_NAMES = [
    "sisyphus",
    "hephaestus",
    "prometheus",
    "atlas",
    "oracle",
    "librarian",
    "explore",
    "multimodal-looker",
    "metis",
    "momus",
    "sisyphus-junior",
];
const SLIM_AGENT_NAMES = [
    "orchestrator",
    "explorer",
    "oracle",
    "council",
    "councillor",
    "librarian",
    "designer",
    "fixer",
    "observer",
];
const BASIC_AGENTS = ["coder", "architect", "visual"];
export const AGENT_NAMES = [
    ...OMO_AGENT_NAMES,
    ...SLIM_AGENT_NAMES,
    ...BASIC_AGENTS,
];
export const MODEL_CATEGORIES = [
    "reasoning",
    "coding",
    "fast",
    "vision",
    "long-context",
    "cheap",
    "general",
];
export const STRATEGY_NAMES = [
    "adaptive",
    "latency",
    "cost",
    "round-robin",
];
