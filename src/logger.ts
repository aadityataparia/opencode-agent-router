const KEYS = ["log", "warn", "error", "trace"] as const;

export const logger = Object.fromEntries(
  KEYS.map((key) => [
    key,
    (...args: unknown[]) =>
      key in console &&
      console[key]?.("[model-router] " + new Date().toISOString(), ...args),
  ]),
) as {
  [K in (typeof KEYS)[number]]: Console[K];
};
