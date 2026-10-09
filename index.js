import { t as logger } from "./logger-BB4yfKgq.js";
import { Agent, Model, Plugin, Provider } from "@opencode/plugin";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { parseJSON5, parseJSONC } from "confbox";
//#region src/agents.ts
var COMMON_AGENTS = {
	architect: {
		weights: {
			cheap: .01,
			fast: .5,
			reasoning: 1,
			coding: .8,
			"long-context": .9,
			general: .4
		},
		minContext: 1e5,
		tools: true
	},
	coder: {
		weights: {
			"long-context": .05,
			coding: 1,
			fast: .9,
			cheap: .8,
			general: .3
		},
		minContext: 32e3,
		tools: true
	},
	vision: {
		weights: {
			cheap: .2,
			vision: 1,
			"long-context": .65,
			fast: .6,
			general: .2
		},
		minContext: 32e3,
		tools: true
	}
};
var AGENT_REQUIREMENTS = {
	sisyphus: COMMON_AGENTS.architect,
	hephaestus: {
		weights: {
			coding: 1,
			reasoning: .9,
			general: .4,
			cheap: .01
		},
		minContext: 64e3,
		tools: true
	},
	prometheus: {
		weights: {
			reasoning: 1,
			"long-context": .95,
			general: .3,
			cheap: .01
		},
		minContext: 1e5,
		tools: true
	},
	atlas: {
		weights: {
			coding: 1,
			reasoning: .85,
			general: .4,
			cheap: .01
		},
		minContext: 64e3,
		tools: true
	},
	explore: {
		weights: {
			fast: 1,
			coding: .8,
			general: .4,
			cheap: .01
		},
		minContext: 32e3,
		tools: true
	},
	"multimodal-looker": {
		weights: {
			vision: 1,
			reasoning: .7,
			general: .2,
			fast: .1,
			cheap: .05,
			"long-context": .05
		},
		minContext: 32e3,
		tools: true
	},
	metis: {
		weights: {
			reasoning: 1,
			"long-context": .8,
			general: .3,
			cheap: .01
		},
		minContext: 1e5,
		tools: true
	},
	momus: {
		weights: {
			reasoning: 1,
			coding: .7,
			"long-context": .8,
			cheap: .01
		},
		minContext: 1e5,
		tools: true
	},
	councillor: {
		weights: {
			cheap: .1,
			fast: .1,
			reasoning: 1,
			"long-context": .85,
			coding: .6
		},
		minContext: 1e5,
		tools: true
	},
	"sisyphus-junior": {
		weights: {
			coding: .8,
			fast: 1,
			cheap: 1,
			general: .4,
			"long-context": .05
		},
		minContext: 32e3,
		tools: true
	},
	orchestrator: COMMON_AGENTS.architect,
	explorer: {
		weights: {
			"long-context": .05,
			fast: 1,
			coding: .8,
			cheap: .9,
			general: .3
		},
		minContext: 1e5,
		tools: true
	},
	oracle: {
		weights: {
			reasoning: 1,
			coding: .8,
			"long-context": .95,
			cheap: .01
		},
		minContext: 1e5,
		tools: true
	},
	council: {
		weights: {
			cheap: .01,
			fast: 0,
			reasoning: 1,
			"long-context": .95,
			coding: .65
		},
		minContext: 1e5,
		tools: true
	},
	librarian: {
		weights: {
			cheap: .35,
			fast: 1,
			"long-context": .75,
			reasoning: .55,
			general: .3
		},
		minContext: 64e3,
		tools: true
	},
	designer: {
		weights: {
			"long-context": .1,
			cheap: .05,
			fast: .1,
			coding: 1,
			vision: .85,
			reasoning: .65,
			general: .3
		},
		minContext: 64e3,
		tools: true
	},
	fixer: COMMON_AGENTS.coder,
	observer: COMMON_AGENTS.vision,
	coder: COMMON_AGENTS.coder,
	architect: COMMON_AGENTS.architect,
	visual: COMMON_AGENTS.vision
};
//#endregion
//#region src/types.ts
var PRESET_NAMES = [
	"oh-my-opencode",
	"oh-my-openagent",
	"oh-my-opencode-slim"
];
/**
* Agent id prefix the router owns; each role's `model` is kept pointed at
* whichever real model wins routing.
*/
var ROUTER_AGENT_PREFIX = "model-router/";
/** The router-owned agent id for a managed role. */
function routerAgentID(agent) {
	return `${ROUTER_AGENT_PREFIX}${agent}`;
}
var OMO_AGENT_NAMES = [
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
	"sisyphus-junior"
];
var SLIM_AGENT_NAMES = [
	"orchestrator",
	"explorer",
	"oracle",
	"council",
	"councillor",
	"librarian",
	"designer",
	"fixer",
	"observer"
];
var BASIC_AGENTS = [
	"coder",
	"architect",
	"visual"
];
[
	...OMO_AGENT_NAMES,
	...SLIM_AGENT_NAMES,
	...BASIC_AGENTS
];
var MODEL_CATEGORIES = [
	"reasoning",
	"coding",
	"fast",
	"vision",
	"long-context",
	"cheap",
	"general"
];
var STRATEGY_NAMES = [
	"adaptive",
	"latency",
	"cost",
	"round-robin"
];
//#endregion
//#region src/presets.ts
var OMO_BUILTIN_AGENTS = [
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
	"sisyphus-junior"
];
var PRESET_AGENTS = {
	"oh-my-opencode": OMO_BUILTIN_AGENTS,
	"oh-my-openagent": OMO_BUILTIN_AGENTS,
	"oh-my-opencode-slim": [
		"orchestrator",
		"explorer",
		"librarian",
		"oracle",
		"designer",
		"fixer",
		"observer",
		"council",
		"councillor"
	]
};
function presetAgentNames(presets) {
	const names = /* @__PURE__ */ new Set();
	for (const preset of presets) for (const agent of PRESET_AGENTS[preset]) names.add(agent);
	return [...names];
}
var files = [
	resolve(homedir(), ".config", "opencode", "opencode.jsonc"),
	resolve(homedir(), ".config", "opencode", "opencode.json"),
	resolve(process.cwd(), "opencode.jsonc"),
	resolve(process.cwd(), "opencode.json")
];
function detectPresets(plugins) {
	const foundFromFile = [];
	for (const file of files) try {
		const config = file.endsWith(".jsonc") ? parseJSONC(readFileSync(file, { encoding: "utf-8" })) : parseJSON5(readFileSync(file, { encoding: "utf-8" }));
		if (config?.plugins) {
			for (const preset of config.plugins) if (typeof preset === "string") {
				if (PRESET_NAMES.includes(preset)) foundFromFile.push(preset);
			} else if (preset.package) {
				if (PRESET_NAMES.includes(preset.package)) foundFromFile.push(preset.package);
			}
		}
	} catch (e) {
		logger.error("Error in reading from file", file, e);
	}
	if (foundFromFile.length > 0) return foundFromFile;
	return PRESET_NAMES.filter((preset) => plugins.some((entry) => entry.id === preset || entry.id?.startsWith(`${preset}@`)));
}
//#endregion
//#region src/config.ts
var DEFAULTS = {
	refreshMs: 36e5,
	cooldownMs: 6e4,
	probeTimeoutMs: 1e4,
	strategy: "adaptive",
	agents: {},
	ignoredProviders: []
};
var Config = class {
	raw;
	detectedPresets;
	constructor(raw, detectedPresets = []) {
		this.raw = raw;
		this.detectedPresets = detectedPresets;
	}
	get current() {
		return {
			refreshMs: this.positiveNumber("refreshMs"),
			probeTimeoutMs: this.positiveNumber("probeTimeoutMs"),
			cooldownMs: this.positiveNumber("cooldownMs"),
			strategy: this.strategy(),
			presets: this.array("presets", this.detectedPresets),
			agents: this.agents(),
			ignoredProviders: this.array("ignoredProviders", [])
		};
	}
	array(key, defaultValue) {
		const value = this.raw[key];
		if (value === void 0) return defaultValue;
		if (!Array.isArray(value)) {
			logger.trace(`ignoring ${key}: expected an array`);
			return defaultValue;
		}
		if (value.length === 0) return defaultValue;
		return value;
	}
	boolean(key, defaultValue) {
		const value = this.raw[key];
		if (value === void 0) return defaultValue;
		if (typeof value !== "boolean") {
			logger.trace(`ignoring ${key}: expected a boolean`);
			return defaultValue;
		}
		return value;
	}
	positiveNumber(key) {
		const value = this.raw[key];
		if (value === void 0) return DEFAULTS[key];
		if (typeof value !== "number" || value <= 0) {
			logger.trace(`ignoring ${key}: expected a positive number`);
			return DEFAULTS[key];
		}
		return value;
	}
	clampedNumber(key, min, max) {
		const value = this.raw[key];
		if (value === void 0) return DEFAULTS[key];
		if (typeof value !== "number" || value < min || value > max) {
			logger.trace(`ignoring ${key}: expected a number between ${min} and ${max}`);
			return DEFAULTS[key];
		}
		return value;
	}
	strategy() {
		const value = this.raw.strategy;
		if (value === void 0) return DEFAULTS.strategy;
		if (typeof value !== "string" || !STRATEGY_NAMES.includes(value)) {
			logger.trace(`ignoring options.strategy: expected a routing strategy (${DEFAULTS.strategy} fallback)`);
			return DEFAULTS.strategy;
		}
		return value;
	}
	agents() {
		let value = this.raw.agents;
		if (typeof value !== "object" || Array.isArray(value)) {
			logger.trace(`ignoring options.agents: expected an object of agent names`);
			value = {};
		}
		const presets = presetAgentNames(this.array("presets", this.detectedPresets));
		const origin = this.raw.presets?.length ? "options" : "detected";
		const overridden = this.raw.agents ? Object.keys(this.raw.agents) : void 0;
		logger.trace(`routing for agents(s): ${presets?.join(", ") || "(none)"} (${origin} presets)` + (overridden ? ` and options.agents: ${overridden}` : ""));
		return {
			...presets.reduce((acc, agent) => {
				acc[agent] = AGENT_REQUIREMENTS[agent];
				return acc;
			}, {}),
			...value
		};
	}
};
//#endregion
//#region src/classifier.ts
var CODING = [
	"codex",
	"coder",
	"coding",
	"code",
	"codestral",
	"devstral",
	"deepseek-coder",
	"qwen-coder",
	"starcoder",
	"swe"
];
var REASONING = [
	"reason",
	"reasoning",
	"thinking",
	"think",
	"o1",
	"o3",
	"o4",
	"r1",
	"r2",
	"opus"
];
var FAST = [
	"mini",
	"nano",
	"flash",
	"haiku",
	"small",
	"lite",
	"fast",
	"instant"
];
var CHEAP = [
	"mini",
	"nano",
	"flash",
	"haiku",
	"small",
	"lite"
];
function contains(text, patterns) {
	return patterns.some((pattern) => text.includes(pattern));
}
function inputSupportsVision(model) {
	const input = model.capabilities?.input;
	if (!Array.isArray(input)) return false;
	return [
		"image",
		"video",
		"pdf"
	].some((kind) => input.includes(kind));
}
function classifyModel(model) {
	const m = model;
	const text = [m.id, m.family].filter(Boolean).join(" ").toLowerCase();
	const categories = /* @__PURE__ */ new Set();
	const vision = Boolean(model.capabilities?.vision) || inputSupportsVision(model) || contains(text, [
		"vision",
		"vl",
		"multimodal"
	]);
	const reasoning = Boolean(model.capabilities?.reasoning) || Boolean(m.compatibility?.reasoningField) || contains(text, REASONING);
	const tools = Boolean(m.capabilities?.tools);
	if (vision) categories.add("vision");
	if (reasoning) categories.add("reasoning");
	if (contains(text, CODING)) categories.add("coding");
	if (contains(text, FAST)) categories.add("fast");
	if (contains(text, CHEAP)) categories.add("cheap");
	if ((m.limit?.context ?? 0) >= 1e5) categories.add("long-context");
	categories.add("general");
	return {
		providerID: String(m.providerID ?? ""),
		id: String(m.id ?? m.modelID ?? ""),
		modelID: m.modelID ?? m.id,
		target: `${m.providerID}/${m.id ?? m.modelID}`,
		name: m.name,
		family: m.family,
		context: Number(m.limit?.context ?? 0),
		outputLimit: Number(m.limit?.output ?? 0),
		capabilities: {
			reasoning,
			vision,
			tools
		},
		cost: {
			input: typeof m.cost[0]?.input === "number" ? m.cost[0]?.input : void 0,
			output: typeof m.cost[0]?.output === "number" ? m.cost[0]?.output : void 0
		},
		categories,
		health: 1,
		latencyMs: Infinity,
		lastProbeResult: true,
		failures: 0,
		successes: 0,
		releasedAt: m.time.released
	};
}
//#endregion
//#region src/model-store.ts
var MODEL_STATE_KEY = "model-router:model-state:";
var ModelStore = class {
	storage;
	config;
	state = /* @__PURE__ */ new Map();
	constructor(storage, config) {
		this.storage = storage;
		this.config = config;
	}
	async setCatalog(catalog) {
		for (const model of catalog) {
			if (this.config.current.ignoredProviders.includes(model.providerID)) continue;
			const classified = classifyModel(model);
			const previous = await this.storage.get(MODEL_STATE_KEY + classified.target);
			const merged = previous ? {
				...classified,
				health: previous.health,
				latencyMs: previous.latencyMs,
				failures: previous.failures,
				successes: previous.successes,
				lastSuccessAt: previous.lastSuccessAt,
				lastFailureAt: previous.lastFailureAt,
				cooldownUntil: previous.cooldownUntil,
				lastProbeAt: previous.lastProbeAt,
				lastProbeResult: previous.lastProbeResult
			} : classified;
			this.setModel(merged);
		}
	}
	getModel(target) {
		return this.state.get(target);
	}
	setModel(model) {
		this.storage.set(MODEL_STATE_KEY + model.target, model);
		this.state.set(model.target, model);
	}
	getAllModels(filter) {
		let models = Array.from(this.state.values());
		if (filter) models = models.filter((model) => model.target.includes(filter));
		return models;
	}
	success(model, latencyMs) {
		const current = this.state.get(model.target);
		if (!current) return;
		current.successes++;
		current.lastSuccessAt = Date.now();
		current.latencyMs = Number.isFinite(current.latencyMs) ? (current.latencyMs * (current.successes - 1) + latencyMs) / current.successes : latencyMs;
		current.health = current.successes / (current.successes + current.failures);
		current.cooldownUntil = void 0;
		current.lastProbeResult = true;
		this.setModel(current);
	}
	failure(model, cooldownMs = 3e4) {
		const current = this.state.get(model.target);
		if (!current) return;
		current.failures++;
		current.lastFailureAt = Date.now();
		current.health = current.successes / (current.successes + current.failures);
		current.cooldownUntil = Date.now() + cooldownMs;
		current.lastProbeResult = false;
		this.setModel(current);
	}
	isCoolingDown(model) {
		return Boolean(model.cooldownUntil && model.cooldownUntil > Date.now());
	}
	/** True when a probe result is stale enough to re-spend a request on; never-probed models always are. */
	needsProbe(target) {
		const current = this.state.get(target);
		if (!current?.lastProbeAt) return true;
		return !this.isCoolingDown(current);
	}
	/** A ping is scored exactly like a real request, so the router learns from one signal. */
	recordProbe(target, result) {
		const current = this.state.get(target);
		if (!current) return;
		current.lastProbeAt = Date.now();
		if (result.verdict === "ok") this.success(current, result.latencyMs);
		else this.failure(current, this.config.current.cooldownMs);
	}
};
//#endregion
//#region src/scorer.ts
function satisfies(model, req) {
	if (req.minContext && model.context < req.minContext) return false;
	if ((req.weights.vision ?? 0) > 0 && !model.capabilities.vision) return false;
	if ((req.weights.reasoning ?? 0) > 0 && !model.capabilities.reasoning) return false;
	if (req.tools && !model.capabilities.tools) return false;
	return true;
}
function latencyScore(model) {
	let latency = model.latencyMs;
	if (!Number.isFinite(model.latencyMs)) latency = 5e3;
	return 1 / (1 + (latency - (model.categories.has("fast") ? 500 : 0)) / 5e3);
}
function costScore(model) {
	const input = ((model.cost.input ?? 0) * 2 + (model.cost.output ?? 0)) / 20;
	return 1 / (1 + Math.max(0, input));
}
function contextScore(model, req) {
	if (!req.minContext) return model.categories.has("long-context") ? 1 : .5;
	return Math.min(model.context / req.minContext, 2) / 2;
}
function categoryScore(model, req) {
	let score = 0;
	let maxWeight = 0;
	req.weights.general = req.weights.general ?? .1;
	for (const [category, weight] of Object.entries(req.weights)) {
		if (!MODEL_CATEGORIES.includes(category)) continue;
		let value;
		switch (category) {
			case "fast":
				value = latencyScore(model);
				break;
			case "cheap":
				value = costScore(model);
				break;
			case "long-context":
				value = contextScore(model, req);
				break;
			case "reasoning":
				value = model.categories.has("fast") ? .5 : 1;
				break;
			default: value = model.categories.has(category) ? 1 : 0;
		}
		score += weight * value;
		maxWeight += weight;
	}
	return maxWeight === 0 ? 0 : score / maxWeight;
}
function capabilityScore(model, req) {
	if (req.tools == null) return 1;
	return model.capabilities.tools === req.tools ? 1 : 0;
}
var DEFAULT_AGENT_REQ = { weights: {
	"long-context": .5,
	reasoning: .5,
	fast: .5,
	cheap: .5
} };
var scoreRecency = (model) => {
	return 1 - (model.releasedAt ? (Date.now() - model.releasedAt) / 31536e6 : 0) / 10;
};
var scoreModel = (model, passed = DEFAULT_AGENT_REQ) => {
	const req = {
		...DEFAULT_AGENT_REQ,
		...passed
	};
	const breakdown = {
		category: categoryScore(model, req),
		health: model.health,
		latency: latencyScore(model),
		cost: costScore(model),
		context: contextScore(model, req),
		capabilities: capabilityScore(model, req),
		recency: scoreRecency(model)
	};
	return {
		score: breakdown.category + breakdown.recency * .1 + breakdown.capabilities * .1,
		breakdown
	};
};
function findCandidates(req, models) {
	return models.filter((model) => satisfies(model, req)).map((model) => {
		return {
			id: model.id,
			providerID: model.providerID,
			target: model.target,
			...scoreModel(model, req)
		};
	}).sort((a, b) => b.score - a.score);
}
//#endregion
//#region src/agent-files.ts
/**
* Writes `model-router/<agent>` Markdown files under `~/.config/opencode/agents/`,
* since `AgentEditor` has no `add`. Never overwrites, and prunes only files still
* byte-for-byte what this module would write.
*/
/** Roles that may also run as a session's primary agent; the rest are subagents. */
var PRIMARY_ROLES = /* @__PURE__ */ new Set(["orchestrator"]);
/** Agent ids become file names; anything outside this set is not written. */
var SAFE_NAME = /^[A-Za-z0-9._-]+$/;
function agentsDir() {
	const configHome = process.env.XDG_CONFIG_HOME?.trim();
	const base = configHome && configHome.length > 0 ? configHome : join(homedir(), ".config");
	return join(base, "opencode", "agents", ROUTER_AGENT_PREFIX);
}
function document(name, model) {
	const mode = PRIMARY_ROLES.has(name) ? "all" : "subagent";
	return [
		"---",
		`description: The ${name} role, with its model chosen and health-tracked by the model router. Dispatch this instead of the unprefixed ${name} to get automatic re-routing.`,
		`mode: ${mode}`,
		...model ? [`model: ${model}`] : [],
		"---",
		"",
		`You are the \`${name}\` role.`,
		"",
		"The model behind this role is managed for you: the opencode-agent-router",
		"plugin picks it from the catalog, tracks its health, and will point it at a",
		"different model on a later refresh. Do not assume a particular model,",
		"provider, or context size, and do not ask which model you are — the answer",
		"is not stable and is not the task.",
		"",
		"Everything else about the role is unchanged: do the work it describes, with",
		"the tools you are given.",
		""
	].join("\n");
}
/**
* True when `current` is this module's own file, with or without a model line.
* Anything else was edited by the user, and is never rewritten or removed.
*/
function isOurs(name, current) {
	return current.replace(/^model: .*\n/m, "") === document(name);
}
/**
* Creates missing agent files and prunes ones for roles no longer routed.
* Best-effort: an unwritable config directory is reported, not thrown.
*/
function syncRoutedAgents(models = /* @__PURE__ */ new Map()) {
	const created = [];
	const updated = [];
	const removed = [];
	const kept = [];
	const dir = agentsDir();
	try {
		mkdirSync(dir, { recursive: true });
	} catch (error) {
		logger.warn(`could not create ${dir}: ${describeError(error)}`);
		return {
			created,
			updated,
			removed,
			kept
		};
	}
	const routed = /* @__PURE__ */ new Set();
	for (const [name] of models) {
		if (!SAFE_NAME.test(name)) {
			logger.warn(`skipping agent ${name}: not a safe file name`);
			continue;
		}
		routed.add(name);
		const file = join(dir, `${name}.md`);
		const wanted = document(name);
		if (existsSync(file)) {
			let current;
			try {
				current = readFileSync(file, "utf8");
			} catch (error) {
				logger.warn(`could not read ${file}: ${describeError(error)}`);
				continue;
			}
			if (current !== wanted) try {
				writeFileSync(file, wanted, "utf8");
				updated.push(`${ROUTER_AGENT_PREFIX}${name}`);
			} catch (error) {
				logger.warn(`could not update ${file}: ${describeError(error)}`);
			}
			continue;
		}
		try {
			writeFileSync(file, wanted, "utf8");
			created.push(`${ROUTER_AGENT_PREFIX}${name}`);
		} catch (error) {
			logger.warn(`could not write ${file}: ${describeError(error)}`);
		}
	}
	for (const entry of agentFiles(dir)) {
		const name = entry.slice(0, -3);
		if (routed.has(name)) continue;
		const file = join(dir, entry);
		let current;
		try {
			current = readFileSync(file, "utf8");
		} catch (error) {
			logger.warn(`could not read ${file}: ${describeError(error)}`);
			continue;
		}
		if (!isOurs(name, current)) {
			kept.push(`${ROUTER_AGENT_PREFIX}${name}`);
			logger.warn(`keeping ${file}: it is not the router's own, so removing it is left to you`);
			continue;
		}
		try {
			rmSync(file);
			removed.push(`${ROUTER_AGENT_PREFIX}${name}`);
		} catch (error) {
			logger.warn(`could not remove ${file}: ${describeError(error)}`);
		}
	}
	return {
		created,
		updated,
		removed,
		kept
	};
}
/** `*.md` agent files in `dir`, ignoring dotfiles and non-agent names. */
function agentFiles(dir) {
	try {
		return readdirSync(dir).filter((entry) => entry.endsWith(".md") && !entry.startsWith(".") && SAFE_NAME.test(entry.slice(0, -3)));
	} catch {
		return [];
	}
}
function describeError(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region src/router.ts
var PIN_KEY = "model-router:pins";
var ASSIGNMENT_KEY = "model-router:assignments";
var Router = class {
	modelStore;
	config;
	storage;
	probe;
	ctxAgent;
	pins = /* @__PURE__ */ new Map();
	cachedAssignments = /* @__PURE__ */ new Map();
	transformDisposer;
	constructor(modelStore, config, storage, probe, ctxAgent) {
		this.modelStore = modelStore;
		this.config = config;
		this.storage = storage;
		this.probe = probe;
		this.ctxAgent = ctxAgent;
	}
	async init() {
		const storedPins = await this.storage.get(PIN_KEY);
		if (storedPins) for (const [agent, target] of Object.entries(storedPins)) this.pins.set(agent, target);
		const storedAssignments = await this.storage.get(ASSIGNMENT_KEY);
		if (storedAssignments) for (const [agent, model] of Object.entries(storedAssignments)) this.cachedAssignments.set(agent, model);
	}
	async getAssignments(agents) {
		const agentsToProcess = agents || Object.keys(this.config.current.agents);
		for (const agent of agentsToProcess) {
			const result = await this.choose(agent);
			this.cachedAssignments.set(agent, result);
		}
		this.storage.set(ASSIGNMENT_KEY, Object.fromEntries(this.cachedAssignments.entries()));
		return this.cachedAssignments;
	}
	pin(agent, modelTarget) {
		if (!this.modelStore.getModel(modelTarget)) throw new Error(`Cannot pin unknown model: ${modelTarget}`);
		this.pins.set(agent, modelTarget);
		this.storage.set(PIN_KEY, Object.fromEntries(this.pins.entries()));
	}
	unpin(agent) {
		this.pins.delete(agent);
	}
	async assignModels(agents) {
		const assignments = await this.getAssignments(agents);
		this.transformDisposer?.();
		this.transformDisposer = void 0;
		const registration = await this.ctxAgent.transform((editor) => {
			let assigned = 0;
			const failed = [];
			for (const [agentName, ref] of assignments) {
				const model = ref ? {
					providerID: Provider.ID.make(ref.providerID),
					id: Model.ID.make(ref.id)
				} : void 0;
				for (const id of [routerAgentID(agentName), agentName]) try {
					const prev = editor.get(id);
					if (prev?.model?.id === model?.id && prev?.model?.providerID === model?.providerID) continue;
					editor.update(id, (agent) => {
						agent.id = Agent.ID.make(id);
						agent.name = Agent.Name.make(id);
						agent.model = model;
					});
					assigned += 1;
				} catch (error) {
					failed.push(`${id}: ${String(error)}`);
				}
			}
			syncRoutedAgents(assignments);
			logger.log(`agent transform: ${assigned} applied, for ${assignments.size} role(s)` + (failed.length > 0 ? `, failed ${failed.join("; ")}` : ""));
		});
		let disposed = false;
		const dispose = async () => {
			if (disposed) return;
			disposed = true;
			if (this.transformDisposer === dispose) this.transformDisposer = void 0;
			return registration.dispose();
		};
		this.transformDisposer = dispose;
		return { dispose };
	}
	async choose(agent) {
		if (!this.config.current.agents[agent]) return void 0;
		if (this.sort(this.getCandidates(agent) || [], this.config.current.strategy).length === 0) return void 0;
		if (this.pins.has(agent)) {
			const pinnedTarget = this.pins.get(agent);
			const pinnedCandidate = this.modelStore.getModel(pinnedTarget);
			if (pinnedCandidate) return pinnedCandidate;
		}
		return this.probeAndSelect(agent);
	}
	async probeAndSelect(agent) {
		const candidates = this.getCandidates(agent);
		if (!candidates || candidates.length === 0) return void 0;
		const current = this.cachedAssignments.get(agent);
		if (current) {
			if ((await this.probeModel(current)).verdict === "ok") return candidates.find((c) => c.target === current.target);
		}
		for (const candidate of candidates) {
			if (candidate.target === current?.target) continue;
			if ((await this.probeModel(candidate)).verdict === "ok") return candidate;
		}
	}
	async probeModel(model) {
		if (this.modelStore.needsProbe(model.target)) {
			const result = await this.probe(model);
			this.modelStore.recordProbe(model.target, result);
			return result;
		}
		const data = this.modelStore.getModel(model.target);
		return {
			verdict: data?.lastProbeResult ? "ok" : "unusable",
			latencyMs: data?.latencyMs ?? 1e4
		};
	}
	sort(candidates, strategy) {
		if (candidates.length === 0) return [];
		switch (strategy) {
			case "round-robin": return candidates.toSorted(() => Math.random() - .5);
			case "latency": return candidates.toSorted((a, b) => this.normalizedLatency(a) - this.normalizedLatency(b));
			case "cost": return candidates.toSorted((a, b) => b.breakdown.cost - a.breakdown.cost);
			default: return candidates.toSorted((a, b) => b.score - a.score);
		}
	}
	normalizedLatency(candidate) {
		const model = this.modelStore.getModel(candidate.target);
		if (!model) return Number.MAX_SAFE_INTEGER;
		return Number.isFinite(model.latencyMs) ? model.latencyMs : Number.MAX_SAFE_INTEGER;
	}
	getCandidates(agent) {
		return this.sort(findCandidates(this.config.current.agents[agent], this.modelStore.getAllModels()), this.config.current.strategy);
	}
};
//#endregion
//#region src/probe.ts
/** Smallest completion that still exercises the full request path. */
var PROMPT = "reply with: ok";
/** Pull a numeric HTTP status out of whatever shape the error arrived in. */
function errorStatus(error) {
	if (typeof error !== "object" || error === null) return void 0;
	const record = error;
	for (const key of [
		"status",
		"statusCode",
		"code"
	]) {
		const value = record[key];
		if (typeof value === "number" && value >= 100 && value < 600) return value;
		if (typeof value === "string" && /^\d{3}$/.test(value)) return Number(value);
	}
}
function describe(error) {
	if (error instanceof Error) return `${error.name}: ${error.message}`;
	if (typeof error === "object" && error !== null) try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
	return String(error);
}
/**
* A failed generate call carries no structured error type, so the verdict is
* matched textually; the status code is preferred where one is present.
*/
function classify(status, detail) {
	if (/insufficient|credits|exhausted/i.test(detail)) return "unusable";
	if (status === 429 || /\b(429)\b/.test(detail) || /rate.?limit|too many requests/i.test(detail)) {
		if (/per.?second|per.?minute/i.test(detail)) return "inconclusive";
		return "unusable";
	}
	if (status === 401 || status === 403) return "unauthorized";
	if (/\b(401|403)\b/.test(detail) || /unauthoriz|forbidden|authenticat|invalid api.?key|missing api.?key|credential|permission.?denied/i.test(detail)) return "unauthorized";
	return "unusable";
}
var hasError = (reply) => {
	return /error/i.test(reply);
};
async function probeModel(model, options) {
	const started = Date.now();
	let timer;
	try {
		const call = options.generate({
			prompt: PROMPT,
			model: {
				providerID: model.providerID,
				id: model.id
			}
		});
		const timeout = new Promise((_resolve, reject) => {
			timer = setTimeout(() => reject(/* @__PURE__ */ new Error(`probe timed out after ${options.timeoutMs}ms`)), options.timeoutMs);
		});
		const ret = await Promise.race([call, timeout]);
		const errored = hasError(ret.text);
		return {
			verdict: errored ? "unusable" : "ok",
			reply: errored ? void 0 : ret.text,
			error: errored ? ret.text : void 0,
			latencyMs: Date.now() - started
		};
	} catch (error) {
		const detail = describe(error);
		const status = errorStatus(error);
		return {
			verdict: classify(status, detail),
			latencyMs: Date.now() - started,
			status,
			error: detail.slice(0, 200)
		};
	} finally {
		if (timer) clearTimeout(timer);
	}
}
//#endregion
//#region src/commands.ts
/** Split on whitespace. Model IDs never contain spaces, so quoting buys nothing. */
function tokenize(text) {
	return text.replace("/router", "").trim().split(/\s+/).filter((token) => token.length > 0);
}
function parseCommand(text) {
	const tokens = tokenize(text);
	if (tokens.length === 0) return { kind: "status" };
	const [action, ...rest] = tokens;
	const verb = action.toLowerCase();
	if (verb === "status" || verb === "show" || verb === "list") return rest.length === 0 ? { kind: "status" } : {
		kind: "error",
		message: `\`status\` takes no arguments.`
	};
	if (verb === "refresh" || verb === "reload" || verb === "rescan") return rest.length === 0 ? { kind: "refresh" } : {
		kind: "refresh",
		agents: rest
	};
	if (verb === "strategy" || verb === "presets") {
		const valid = STRATEGY_NAMES.join(", ");
		if (rest.length === 0) return {
			kind: "error",
			message: `\`strategy\` takes one strategy: \`/router strategy latency\`. Valid: ${valid}.`
		};
		if (rest.length > 1) return {
			kind: "error",
			message: `\`strategy\` takes exactly one strategy; got ${rest.length} arguments.`
		};
		const wanted = rest[0].trim().toLowerCase();
		if (!STRATEGY_NAMES.includes(wanted)) return {
			kind: "error",
			message: `Unknown strategy \`${rest[0]}\`. Valid: ${valid}.`
		};
		return {
			kind: "strategy",
			strategy: wanted
		};
	}
	if (verb === "help" || verb === "?") return { kind: "help" };
	if (verb === "unpin" || verb === "reset") {
		if (rest.length === 0) return { kind: "unpin-all" };
		if (rest.length > 1) return {
			kind: "error",
			message: `\`unpin\` takes one agent. Use \`/router unpin\` to clear every pin.`
		};
		return {
			kind: "unpin",
			agent: rest[0]
		};
	}
	if (verb === "usable" || verb === "models" || verb === "pool") return {
		kind: "usable",
		filter: rest.join(" ")
	};
	if (verb === "debug") {
		if (rest.length === 0) return {
			kind: "error",
			message: "`debug` takes a model reference: `/router debug provider/model-id`"
		};
		return {
			kind: "debug",
			modelRef: rest.join(" ")
		};
	}
	if (verb === "probe" || verb === "ping") {
		if (rest.length === 0) return {
			kind: "error",
			message: `\`${verb}\` takes a model reference: \`/router probe provider/model-id\``
		};
		return {
			kind: "probe",
			modelRef: rest.join(" ")
		};
	}
	if (verb === "pin") {
		if (rest[0] === "--clear" || rest[0] === "clear") return { kind: "unpin-all" };
		if (rest.length < 2) return {
			kind: "error",
			message: `\`pin\` needs an agent and a model: \`/router pin explorer opencode/model-id\`. Use \`/router unpin\` to clear every pin.`
		};
		if (rest.length > 2) return {
			kind: "error",
			message: `\`pin\` takes exactly one agent and one model; got ${rest.length} arguments.`
		};
		return {
			kind: "pin",
			agent: rest[0],
			model: rest[1]
		};
	}
	return {
		kind: "error",
		message: `Unknown action \`${action}\`. Run \`/router help\` for the list.`
	};
}
function normalize(value) {
	return value.trim().toLowerCase();
}
function healthCell(model, now) {
	if (model.cooldownUntil && model.cooldownUntil > now) return `${model.health.toFixed(2)} (cooling) (${model.successes} ok / ${model.failures} failed)`;
	return model.health.toFixed(2) + ` (${model.successes} ok / ${model.failures} failed)`;
}
function tableRow(...cells) {
	return `| ${cells.join(" | ")} |`;
}
function table(header, rows) {
	const lines = [];
	lines.push(tableRow(...header), tableRow(...header.map(() => "---")));
	for (const row of rows) lines.push(tableRow(...row));
	return lines.join("\n");
}
function formatStatus(config, store, router) {
	const lines = [];
	lines.push(`**model-router** · ${config.current.strategy} · presets: ${config.current.presets.join(", ") || "none detected"}`, "");
	const routed = Array.from(router.cachedAssignments.keys());
	if (routed.length === 0) lines.push("No agents are in scope. Set `presets` in the plugin options, or declare an `agents` entry.");
	else {
		lines.push(table([
			"agent",
			"model",
			"health",
			"latency",
			"note"
		], []));
		for (const agent of routed) {
			const model = router.cachedAssignments.get(agent);
			const pin = router.pins.get(agent);
			if (!model) {
				const note = pin ? "pinned model unavailable" : "no candidate";
				lines.push(`| \`${agent}\` | — | — | — | ${note} |`);
				continue;
			}
			const notes = [];
			if (pin) notes.push(normalize(model.target) === normalize(pin) ? "pinned" : `pin \`${pin}\` unavailable, routed instead`);
			const modelData = store.getModel(model.target);
			if (!modelData) notes.push("model not in store");
			lines.push(`| \`${agent}\` | \`${model.target}\` | ${healthCell(modelData, Date.now())} | ${Number.isFinite(modelData?.latencyMs) ? `${modelData?.latencyMs.toFixed(0)}ms` : "—"} | ${notes.join("; ") || "—"} |`);
		}
	}
	return lines.join("\n");
}
/** The pool a routing pass can choose from, for `/router usable`. */
function formatUsable(config, store, router, agent) {
	if (!agent) return `No agent specified. Run \`/router usable <agent>\` to see the pool for one agent.`;
	const lines = [];
	const pool = router.getCandidates(agent) || [];
	if (pool.length === 0) return [
		"No models are routable right now.",
		"",
		"Every discovered model is either unusable or in cooldown. Run",
		"`/router refresh` to re-probe, and check the status for an auth block."
	].join("\n");
	lines.push(`**${pool.length} model(s) routable** · ${pool.length} usable for ${agent} · ${store.getAllModels().length} discovered`, "", `| model | health | score (for ${agent}) | latency |`, "| --- | --- | --- | --- |");
	for (const model of pool) {
		const modelData = store.getModel(model.target);
		if (!modelData) {
			lines.push(`| \`${model.target}\` | — | — | — | model not in store |`);
			continue;
		}
		const latency = Number.isFinite(modelData.latencyMs) && modelData.latencyMs > 0 ? `${modelData.latencyMs.toFixed(0)}ms` : "—";
		const seen = modelData.lastProbeAt === void 0 ? "" : ` · ${modelData.successes} ok / ${modelData.failures} failed`;
		lines.push(`| \`${model.target}\` | ${healthCell(modelData, Date.now())}${seen} | ${model.score.toFixed(2)} | ${latency} |`);
	}
	return lines.join("\n");
}
var HELP_TEXT = [
	"**/router** — inspect and steer the model router",
	"",
	"| command | effect |",
	"| --- | --- |",
	"| `/router` | show routing status |",
	"| `/router usable <agent?>` | list every model the router can currently pick |",
	"| `/router refresh` | re-scan providers and re-route now, ignoring probe cache and cooldown |",
	"| `/router strategy <name>` | switch routing strategy and re-route now (session-only) |",
	"| `/router pin <agent> <model>` | force one agent onto one model, persisted |",
	"| `/router unpin <agent>` | drop one pin |",
	"| `/router unpin` | drop every pin |",
	"| `/router debug <model>` | show one model's capabilities and score breakdown |",
	"| `/router probe <model>` | ping one model now and report the raw result |",
	"",
	"Pins live in memory for this session only and are lost on restart. For a",
	"permanent change, set `presets` in the plugin options or point the agent at",
	"`model-router/<agent>` directly."
].join("\n");
async function handleRouterCommand(prompt, context) {
	const { config, modelStore, router, say, session, reassign } = context;
	const command = parseCommand(prompt);
	const status = () => formatStatus(config, modelStore, router);
	switch (command.kind) {
		case "status":
			say(status());
			break;
		case "usable":
			if (!session.agent) say("Agent is not supported");
			say(formatUsable(config, modelStore, router, command.filter || session.agent?.replace("model-router/", "")));
			break;
		case "refresh":
			say("Refreshing the router...");
			if (command.agents) {
				await reassign(command.agents);
				say(`Router refreshed for agents \`${command.agents?.join(", ")}\`.\n` + status());
			} else {
				await reassign();
				say("Router refreshed.\n" + status());
			}
			break;
		case "strategy":
			config.current.strategy = command.strategy;
			say(`Routing strategy set to \`${command.strategy}\`. Re-routing...`);
			await reassign();
			say(`Routing strategy set to \`${command.strategy}\`. Re-routing complete.
` + status());
			break;
		case "pin":
			router.pin(command.agent, command.model);
			await reassign();
			say(`Pinned agent \`${command.agent}\` to model \`${command.model}\`.`);
			break;
		case "unpin":
			router.unpin(command.agent);
			await reassign();
			say(`Unpinned agent \`${command.agent}\`.`);
			break;
		case "unpin-all":
			router.pins.clear();
			await reassign();
			say("Unpinned every agent.");
			break;
		case "help":
			say(HELP_TEXT);
			break;
		case "error":
			say(`Error: ${command.message}`);
			break;
		case "debug": {
			const model = modelStore.getModel(command.modelRef);
			if (!model) {
				say(`Model \`${command.modelRef}\` not found in the store. Similar models: ${modelStore.getAllModels(command.modelRef).map((m) => `\`${m.target}\``).join(", ") || "none"}`);
				return;
			}
			say(`Debug for model \`${command.modelRef}\`:\n\n\`\`\`json\n${JSON.stringify(model, null, 2)}\n\`\`\``);
			break;
		}
		case "probe": {
			const model = modelStore.getModel(command.modelRef);
			if (!model) {
				say(`Model \`${command.modelRef}\` not found in the store. Similar models: ${modelStore.getAllModels(command.modelRef).map((m) => `\`${m.target}\``).join(", ") || "none"}`);
				return;
			}
			say(`Probing model \`${command.modelRef}\`...`);
			const result = await router.probeModel(model);
			say(`Probe result for model \`${command.modelRef}\`:\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``);
			break;
		}
		default: say(`Unhandled command: ${prompt}`);
	}
}
//#endregion
//#region src/setup.ts
var ROUTER_COMMAND = "router";
var reassign = async (ctx, router, session, agents) => {
	return router.assignModels(agents).then(() => {
		if (!session.agent) return;
		const newModel = router.cachedAssignments.get(session.agent.replace(ROUTER_AGENT_PREFIX, ""));
		if (newModel && (newModel?.id !== session.model?.id || newModel?.providerID !== session.model?.providerID)) return ctx.session.switchModel({
			sessionID: session.id,
			model: newModel
		});
	});
};
var setup = async (ctx) => {
	await ctx.agent.reload();
	const plugins = await ctx.plugin.list();
	const catalog = await ctx.model.list();
	const detected = detectPresets(plugins.data);
	logger.log(`plugin registry: ${Array.isArray(plugins?.data) ? plugins.data.length : "non-array"} entries -> presets ${JSON.stringify(detected)}`);
	const config = new Config(ctx.options, detected);
	const modelStore = new ModelStore(ctx.storage, config);
	await modelStore.setCatalog(catalog.data);
	const router = new Router(modelStore, config, ctx.storage, (model) => probeModel(model, {
		generate: ctx.generate.text,
		timeoutMs: config.current.probeTimeoutMs
	}), ctx.agent);
	await router.init();
	let agentReg = await router.assignModels();
	const commandDisposer = await ctx.command.transform((editor) => {
		editor.add({
			name: ROUTER_COMMAND,
			description: "Inspect and steer the model router: status, refresh, pin an agent to a model",
			execute: async (input) => {
				const curSession = await ctx.session.get({ sessionID: input.sessionID });
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
"""`
							});
						} catch (error) {
							logger.error("could not post /router output to the session", error);
						}
					},
					reassign: (agents) => {
						return reassign(ctx, router, curSession, agents);
					}
				});
			}
		});
	});
	await ctx.command.reload();
	await ctx.agent.reload();
	const timer = setTimeout(async () => {
		agentReg = await router.assignModels();
	}, config.current.refreshMs);
	await ctx.session.hook("http.request", (req) => {
		req.request.startTime = Date.now();
	});
	await ctx.session.hook("http.response", async (req) => {
		const target = `${req.model.providerID}/${req.model.id}`;
		if (!req.request.startTime) return;
		modelStore.recordProbe(target, {
			verdict: req.response.ok ? "ok" : "unusable",
			latencyMs: Date.now() - req.request.startTime
		});
		if (!req.response.ok) {
			const curSession = await ctx.session.get({ sessionID: req.sessionID });
			if (curSession.agent) reassign(ctx, router, await ctx.session.get({ sessionID: req.sessionID }), [curSession.agent.replace(ROUTER_AGENT_PREFIX, "")]);
		}
	});
	await ctx.session.hook("experimental.ws.receive", (req) => {
		const target = `${req.model.providerID}/${req.model.id}`;
		modelStore.recordProbe(target, {
			verdict: "ok",
			latencyMs: 100
		});
	});
	await ctx.session.hook("model.request", async (input) => {
		if (input.model.providerID === "model-router") {
			const curSession = await ctx.session.get({ sessionID: input.sessionID });
			reassign(ctx, router, curSession, [input.agent]);
		}
	});
	return async () => {
		await commandDisposer.dispose();
		await agentReg?.dispose();
		if (timer) clearTimeout(timer);
	};
};
//#endregion
//#region src/index.ts
var src_default = Plugin.define({
	id: "model-router",
	setup
});
//#endregion
export { src_default as default };
