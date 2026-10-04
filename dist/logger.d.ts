declare const KEYS: readonly ["log", "warn", "error", "trace"];
export declare const logger: { [K in (typeof KEYS)[number]]: Console[K]; };
export {};
