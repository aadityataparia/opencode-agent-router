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
export { logger as t };
