System.register("src/types", [], function (exports_1, context_1) {
    "use strict";
    var OMO_AGENT_NAMES, SLIM_AGENT_NAMES, BASIC_AGENTS, AGENT_NAMES;
    var __moduleName = context_1 && context_1.id;
    return {
        setters: [],
        execute: function () {
            OMO_AGENT_NAMES = [
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
            SLIM_AGENT_NAMES = [
                "orchestrator",
                "explorer",
                // "oracle",
                "council",
                // "librarian",
                "designer",
                "fixer",
                "observer",
            ];
            BASIC_AGENTS = ["coder", "architect", "visual"];
            exports_1("AGENT_NAMES", AGENT_NAMES = [
                ...OMO_AGENT_NAMES,
                ...SLIM_AGENT_NAMES,
                ...BASIC_AGENTS,
            ]);
        }
    };
});
System.register("src/agents", [], function (exports_2, context_2) {
    "use strict";
    var COMMON_AGENTS, AGENT_REQUIREMENTS;
    var __moduleName = context_2 && context_2.id;
    return {
        setters: [],
        execute: function () {
            COMMON_AGENTS = {
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
            exports_2("AGENT_REQUIREMENTS", AGENT_REQUIREMENTS = {
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
            });
        }
    };
});
System.register("src/classifier", [], function (exports_3, context_3) {
    "use strict";
    var CODING, REASONING, FAST, CHEAP;
    var __moduleName = context_3 && context_3.id;
    function contains(text, patterns) {
        return patterns.some((pattern) => text.includes(pattern));
    }
    function inputSupportsImage(model) {
        const input = model?.capabilities?.input;
        return Array.isArray(input) && input.includes("image");
    }
    function classifyModel(model) {
        const text = [
            model?.providerID,
            model?.id,
            model?.name,
            model?.family,
        ].filter(Boolean).join(" ").toLowerCase();
        const categories = new Set();
        const vision = Boolean(model?.capabilities?.vision) || inputSupportsImage(model) ||
            contains(text, ["vision", "vl", "multimodal"]);
        const reasoning = Boolean(model?.capabilities?.reasoning) || contains(text, REASONING);
        const tools = Boolean(model?.capabilities?.tools);
        if (vision)
            categories.add("vision");
        if (reasoning)
            categories.add("reasoning");
        if (contains(text, CODING))
            categories.add("coding");
        if (contains(text, FAST))
            categories.add("fast");
        if (contains(text, CHEAP))
            categories.add("cheap");
        if ((model?.limit?.context ?? 0) >= 100_000)
            categories.add("long-context");
        categories.add("general");
        return {
            providerID: String(model?.providerID ?? ""),
            id: String(model?.id ?? ""),
            name: model?.name,
            family: model?.family,
            context: Number(model?.limit?.context ?? 0),
            outputLimit: Number(model?.limit?.output ?? 0),
            capabilities: { reasoning, vision, tools },
            cost: {
                input: typeof model?.cost?.input === "number" ? model.cost.input : undefined,
                output: typeof model?.cost?.output === "number" ? model.cost.output : undefined,
            },
            categories,
            health: 1,
            latencyMs: Infinity,
            failures: 0,
            successes: 0,
        };
    }
    exports_3("classifyModel", classifyModel);
    return {
        setters: [],
        execute: function () {
            CODING = ["codex", "coder", "coding", "code", "codestral", "devstral", "deepseek-coder", "qwen-coder", "starcoder", "swe"];
            REASONING = ["reason", "reasoning", "thinking", "think", "o1", "o3", "o4", "r1", "r2", "opus"];
            FAST = ["mini", "nano", "flash", "haiku", "small", "lite", "fast", "instant"];
            CHEAP = ["mini", "nano", "flash", "haiku", "small", "lite"];
        }
    };
});
System.register("src/config", [], function (exports_4, context_4) {
    "use strict";
    var strategies;
    var __moduleName = context_4 && context_4.id;
    function numberEnv(name, fallback) {
        const value = Number(process.env[name]);
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }
    function boolEnv(name, fallback) {
        const value = process.env[name];
        if (value == null)
            return fallback;
        return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    }
    function loadConfig() {
        const raw = process.env.OCO_ROUTER_STRATEGY ?? "adaptive";
        const strategy = strategies.has(raw)
            ? raw
            : "adaptive";
        return {
            refreshMs: numberEnv("OCO_ROUTER_REFRESH_MS", 60_000),
            maxFallbacks: Math.max(1, Math.floor(numberEnv("OCO_ROUTER_MAX_FALLBACKS", 5))),
            probe: boolEnv("OCO_ROUTER_PROBE", false),
            probeTimeoutMs: numberEnv("OCO_ROUTER_PROBE_TIMEOUT_MS", 8_000),
            strategy,
            minHealth: Math.min(1, Math.max(0, Number(process.env.OCO_ROUTER_MIN_HEALTH ?? 0.2))),
            log: boolEnv("OCO_ROUTER_LOG", false),
        };
    }
    exports_4("loadConfig", loadConfig);
    return {
        setters: [],
        execute: function () {
            strategies = new Set([
                "priority",
                "round-robin",
                "weighted",
                "latency",
                "rate",
                "adaptive",
            ]);
        }
    };
});
System.register("src/health", [], function (exports_5, context_5) {
    "use strict";
    var HealthStore;
    var __moduleName = context_5 && context_5.id;
    return {
        setters: [],
        execute: function () {
            HealthStore = class HealthStore {
                state = new Map();
                key(model) {
                    return `${model.providerID}/${model.id}`;
                }
                merge(models) {
                    return models.map((model) => {
                        const previous = this.state.get(this.key(model));
                        const merged = previous ? {
                            ...model,
                            health: previous.health,
                            latencyMs: previous.latencyMs,
                            failures: previous.failures,
                            successes: previous.successes,
                            lastSuccessAt: previous.lastSuccessAt,
                            lastFailureAt: previous.lastFailureAt,
                            cooldownUntil: previous.cooldownUntil,
                        } : model;
                        this.state.set(this.key(model), merged);
                        return merged;
                    });
                }
                success(model, latencyMs) {
                    const current = this.state.get(this.key(model));
                    if (!current)
                        return;
                    current.successes++;
                    current.lastSuccessAt = Date.now();
                    current.latencyMs = Number.isFinite(current.latencyMs)
                        ? current.latencyMs * 0.8 + latencyMs * 0.2
                        : latencyMs;
                    current.health = Math.min(1, current.health * 0.8 + 1 * 0.2);
                    current.cooldownUntil = undefined;
                }
                failure(model, cooldownMs = 30_000) {
                    const current = this.state.get(this.key(model));
                    if (!current)
                        return;
                    current.failures++;
                    current.lastFailureAt = Date.now();
                    current.health = Math.max(0, current.health * 0.7);
                    current.cooldownUntil = Date.now() + cooldownMs;
                }
                isCoolingDown(model) {
                    return Boolean(model.cooldownUntil && model.cooldownUntil > Date.now());
                }
                successRate(model) {
                    const total = model.successes + model.failures;
                    return total === 0 ? 0.5 : model.successes / total;
                }
            };
            exports_5("HealthStore", HealthStore);
        }
    };
});
System.register("src/scorer", ["src/agents"], function (exports_6, context_6) {
    "use strict";
    var agents_js_1, defaultReq;
    var __moduleName = context_6 && context_6.id;
    function satisfies(model, req) {
        if (req.minContext && model.context < req.minContext)
            return false;
        if (req.vision && !model.capabilities.vision)
            return false;
        if (req.reasoning && !model.capabilities.reasoning)
            return false;
        if (req.tools && !model.capabilities.tools)
            return false;
        return true;
    }
    function categoryScore(model, req) {
        let score = 0;
        for (const category of req.categories) {
            if (model.categories.has(category))
                score += req.weights[category] ?? 0;
        }
        return score;
    }
    function latencyScore(model) {
        if (!Number.isFinite(model.latencyMs))
            return 0.5;
        return 1 / (1 + model.latencyMs / 1000);
    }
    function costScore(model) {
        const input = model.cost.input;
        if (typeof input !== "number")
            return 0.5;
        return 1 / (1 + Math.max(0, input));
    }
    function contextScore(model, req) {
        if (!req.minContext)
            return 1;
        return Math.min(model.context / req.minContext, 2) / 2;
    }
    function capabilityScore(model, req) {
        const checks = [
            req.vision == null ? null : model.capabilities.vision === req.vision,
            req.reasoning == null
                ? null
                : model.capabilities.reasoning === req.reasoning,
            req.tools == null ? null : model.capabilities.tools === req.tools,
        ].filter((x) => x !== null);
        return checks.length === 0
            ? 1
            : checks.filter(Boolean).length / checks.length;
    }
    function findCandidates(agent, models, additionals) {
        const req = {
            ...defaultReq,
            ...(agents_js_1.AGENT_REQUIREMENTS[agent] ?? additionals[agent]),
        };
        return models
            .filter((model) => model.health > 0 && satisfies(model, req))
            .map((model) => {
            const breakdown = {
                category: categoryScore(model, req),
                health: model.health,
                latency: latencyScore(model),
                cost: costScore(model),
                context: contextScore(model, req),
                capabilities: capabilityScore(model, req),
            };
            const score = breakdown.category +
                req.healthWeight * breakdown.health +
                req.latencyWeight * breakdown.latency +
                req.costWeight * breakdown.cost +
                req.contextWeight * breakdown.context +
                0.1 * breakdown.capabilities;
            return { model, score, breakdown };
        })
            .sort((a, b) => b.score - a.score);
    }
    exports_6("findCandidates", findCandidates);
    return {
        setters: [
            function (agents_js_1_1) {
                agents_js_1 = agents_js_1_1;
            }
        ],
        execute: function () {
            defaultReq = {
                categories: ["fast", "cheap", "general"],
                weights: {
                    cheap: 1,
                    fast: 1,
                    general: 0.5,
                },
                latencyWeight: 1,
                healthWeight: 1,
                costWeight: 1,
                contextWeight: 0.7,
            };
        }
    };
});
System.register("src/router", [], function (exports_7, context_7) {
    "use strict";
    var Router;
    var __moduleName = context_7 && context_7.id;
    return {
        setters: [],
        execute: function () {
            Router = class Router {
                health;
                cursors = new Map();
                constructor(health) {
                    this.health = health;
                }
                choose(agent, candidates, strategy) {
                    if (candidates.length === 0)
                        return undefined;
                    switch (strategy) {
                        case "round-robin":
                            return this.roundRobin(agent, candidates);
                        case "weighted":
                            return this.weighted(candidates);
                        case "latency":
                            return [...candidates].sort((a, b) => this.normalizedLatency(a) - this.normalizedLatency(b))[0];
                        case "rate":
                            return [...candidates].sort((a, b) => this.health.successRate(b.model) - this.health.successRate(a.model))[0];
                        case "priority":
                            return candidates[0];
                        case "adaptive":
                        default:
                            return this.adaptive(candidates);
                    }
                }
                roundRobin(agent, candidates) {
                    const cursor = this.cursors.get(agent) ?? 0;
                    const candidate = candidates[cursor % candidates.length];
                    this.cursors.set(agent, cursor + 1);
                    return candidate;
                }
                weighted(candidates) {
                    const weights = candidates.map((candidate) => Math.max(0.01, candidate.score));
                    const total = weights.reduce((a, b) => a + b, 0);
                    let pick = Math.random() * total;
                    for (let i = 0; i < candidates.length; i++) {
                        pick -= weights[i];
                        if (pick <= 0)
                            return candidates[i];
                    }
                    return candidates.at(-1);
                }
                normalizedLatency(candidate) {
                    return Number.isFinite(candidate.model.latencyMs)
                        ? candidate.model.latencyMs
                        : Number.MAX_SAFE_INTEGER;
                }
                adaptive(candidates) {
                    return [...candidates].sort((a, b) => {
                        const aRate = this.health.successRate(a.model);
                        const bRate = this.health.successRate(b.model);
                        const aLatency = this.normalizedLatency(a);
                        const bLatency = this.normalizedLatency(b);
                        const aValue = a.score + aRate * 0.25 - Math.min(aLatency / 10_000, 1) * 0.15;
                        const bValue = b.score + bRate * 0.25 - Math.min(bLatency / 10_000, 1) * 0.15;
                        return bValue - aValue;
                    })[0];
                }
            };
            exports_7("Router", Router);
        }
    };
});
System.register("src/index", ["src/config", "src/classifier", "src/health", "src/scorer", "src/router", "src/types", "@opencode-ai/plugin", "@opencode-ai/plugin/promise/plugin"], function (exports_8, context_8) {
    "use strict";
    var config_js_1, classifier_js_1, health_js_1, scorer_js_1, router_js_1, types_js_1, plugin_1, plugin_2, OpenCodeAgentRouter;
    var __moduleName = context_8 && context_8.id;
    function modelName(model) {
        return `${model.providerID}/${model.id}`;
    }
    function log(enabled, ...args) {
        if (enabled)
            console.log("[opencode-agent-router]", ...args);
    }
    return {
        setters: [
            function (config_js_1_1) {
                config_js_1 = config_js_1_1;
            },
            function (classifier_js_1_1) {
                classifier_js_1 = classifier_js_1_1;
            },
            function (health_js_1_1) {
                health_js_1 = health_js_1_1;
            },
            function (scorer_js_1_1) {
                scorer_js_1 = scorer_js_1_1;
            },
            function (router_js_1_1) {
                router_js_1 = router_js_1_1;
            },
            function (types_js_1_1) {
                types_js_1 = types_js_1_1;
            },
            function (plugin_1_1) {
                plugin_1 = plugin_1_1;
            },
            function (plugin_2_1) {
                plugin_2 = plugin_2_1;
            }
        ],
        execute: function () {
            exports_8("OpenCodeAgentRouter", OpenCodeAgentRouter = plugin_2.define({
                id: "opencode-agent-router",
                setup: async (ctx) => {
                    const config = config_js_1.loadConfig();
                    const health = new health_js_1.HealthStore();
                    const router = new router_js_1.Router(health);
                    let timer;
                    let refreshing = false;
                    async function discover() {
                        const catalog = await ctx.catalog.model.list();
                        const models = catalog.data.map(classifier_js_1.classifyModel);
                        return health.merge(models);
                    }
                    async function applyRouting(reason) {
                        if (refreshing)
                            return;
                        refreshing = true;
                        try {
                            const models = await discover();
                            log(config.log, `discovered ${models.length} models (${reason})`);
                            const assignments = new Map();
                            const userDefinedAgents = ctx.options["agents"];
                            for (const agentName of [
                                ...types_js_1.AGENT_NAMES,
                                ...Object.keys(userDefinedAgents),
                            ]) {
                                const candidates = scorer_js_1.findCandidates(agentName, models, userDefinedAgents).filter(({ model }) => model.health >= config.minHealth);
                                if (candidates.length === 0) {
                                    log(config.log, `no suitable model for ${agentName}; leaving unchanged`);
                                    continue;
                                }
                                const chosen = router.choose(agentName, candidates, config.strategy);
                                if (!chosen)
                                    continue;
                                assignments.set(agentName, plugin_1.Model.Ref.parse(modelName(chosen.model)));
                            }
                            await ctx.agent.transform((agents) => {
                                for (const [agentName, ref] of assignments) {
                                    agents.update(agentName, (agent) => {
                                        agent.model = ref;
                                    });
                                }
                            });
                            await ctx.agent.reload();
                            for (const [agent, ref] of assignments) {
                                log(config.log, agent, "=>", `${ref.providerID}/${ref.id}`);
                            }
                        }
                        catch (error) {
                            console.error("[opencode-agent-router] refresh failed", error);
                        }
                        finally {
                            refreshing = false;
                        }
                    }
                    await applyRouting("startup");
                    timer = setInterval(() => {
                        void applyRouting("periodic-refresh");
                    }, config.refreshMs);
                    // Clear the timer when OpenCode unloads/reloads the plugin.
                    return () => {
                        if (timer)
                            clearInterval(timer);
                    };
                },
            }));
            exports_8("default", OpenCodeAgentRouter);
        }
    };
});
