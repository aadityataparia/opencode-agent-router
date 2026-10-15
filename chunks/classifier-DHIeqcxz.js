import { appendFileSync } from "node:fs";
//#region src/logger.ts
var KEYS = [
	"log",
	"warn",
	"error",
	"trace"
];
var TRACE = process.env.OPENCODE_AGENT_ROUTER_TRACE;
var logger = Object.fromEntries(KEYS.map((key) => [key, (...args) => {
	key in console && console[key]?.("[model-router] " + (/* @__PURE__ */ new Date()).toISOString(), ...args);
	if (TRACE) try {
		appendFileSync(TRACE, `[${key}] ${(/* @__PURE__ */ new Date()).toISOString()} ${args.map((arg) => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ")}\n`);
	} catch {}
}]));
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
var getModelTarget = (model) => {
	if (model.id?.includes("/")) return model.id;
	return `${model.providerID}/${model.id ?? model.modelID}`;
};
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
		providerID: m.providerID,
		id: m.id,
		modelID: m.modelID,
		target: getModelTarget(m),
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
export { getModelTarget as n, logger as r, classifyModel as t };
