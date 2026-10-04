const KEYS = ["log", "warn", "error", "trace"];
export const logger = Object.fromEntries(KEYS.map((key) => [
    key,
    (...args) => key in console &&
        console[key]?.("[model-router] " + new Date().toISOString(), ...args),
]));
