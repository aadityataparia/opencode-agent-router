import { appendFileSync } from "node:fs";
const KEYS = ["log", "warn", "error", "trace"];
const TRACE = process.env.OPENCODE_AGENT_ROUTER_TRACE;
export const logger = Object.fromEntries(KEYS.map((key) => [
    key,
    (...args) => {
        key in console &&
            console[key]?.("[model-router] " + new Date().toISOString(), ...args);
        if (TRACE) {
            try {
                appendFileSync(TRACE, `[${key}] ${new Date().toISOString()} ${args
                    .map((arg) => typeof arg === "string" ? arg : JSON.stringify(arg))
                    .join(" ")}\n`);
            }
            catch { }
        }
    },
]));
