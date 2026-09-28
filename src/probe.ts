import type { DiscoveredModel } from "./types";
import { Context } from "@opencode/plugin/promise/plugin";

/**
 * Probes go through OpenCode's own generate API, so they use the real endpoint,
 * SDK and credentials — the only check that reflects request time, and the only
 * way to reach credentials held in the auth store rather than the config.
 */

/**
 * `ok` answered · `unusable` the endpoint will not serve it, including a quota
 * that is spent rather than momentarily throttled · `unauthorized` the
 * credential was rejected (not the model's fault, but it still cannot serve
 * traffic) · `inconclusive` a transient throttle, which must never shrink the
 * pool on its own.
 */
export type ProbeVerdict = "ok" | "unusable" | "unauthorized" | "inconclusive";

export interface ProbeResult {
  readonly verdict: ProbeVerdict;
  readonly latencyMs: number;
  readonly reply?: string;
  readonly status?: number;
  readonly error?: string;
}

export interface ProbeOptions {
  /** OpenCode's generate call, which resolves the endpoint and credentials. */
  readonly generate: Context["generate"]["text"];
  readonly timeoutMs: number;
}

/** Smallest completion that still exercises the full request path. */
const PROMPT = "ping";

/** Pull a numeric HTTP status out of whatever shape the error arrived in. */
function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as Record<string, unknown>;
  for (const key of ["status", "statusCode", "code"]) {
    const value = record[key];
    if (typeof value === "number" && value >= 100 && value < 600) return value;
    if (typeof value === "string" && /^\d{3}$/.test(value))
      return Number(value);
  }
  return undefined;
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/**
 * A failed generate call carries no structured error type, so the verdict is
 * matched textually; the status code is preferred where one is present.
 */
function classify(status: number | undefined, detail: string): ProbeVerdict {
  if (/insufficient|credits|exhausted/i.test(detail)) {
    return "unusable";
  }

  if (
    status === 429 ||
    /\b(429)\b/.test(detail) ||
    /rate.?limit|too many requests/i.test(detail)
  ) {
    if (/per.?second|per.?minute/i.test(detail)) return "inconclusive";
    return "unusable";
  }

  // Not the model's fault, but it cannot serve traffic until the provider is back.
  if (status === 401 || status === 403) return "unauthorized";
  if (
    /\b(401|403)\b/.test(detail) ||
    /unauthoriz|forbidden|authenticat|invalid api.?key|missing api.?key|credential|permission.?denied/i.test(
      detail,
    )
  ) {
    return "unauthorized";
  }

  // Everything else means the endpoint will not serve this model.
  return "unusable";
}

const hasError = (reply: string) => {
  return /error/i.test(reply);
};

export async function probeModel(
  model: Pick<DiscoveredModel, "id" | "modelID" | "providerID">,
  options: ProbeOptions,
): Promise<ProbeResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    // No abort signal on OpenCode's generate call, so the timeout is enforced
    // here and the loser's result is dropped.
    const call = options.generate({
      prompt: PROMPT,
      model: { providerID: model.providerID, id: model.modelID ?? model.id },
    });

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`probe timed out after ${options.timeoutMs}ms`)),
        options.timeoutMs,
      );
    });

    const ret = await Promise.race([call, timeout]);
    const errored = hasError(ret.text);

    return {
      verdict: errored ? "unusable" : "ok",
      reply: errored ? undefined : ret.text,
      error: errored ? ret.text : undefined,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const detail = describe(error);
    return {
      verdict: classify(errorStatus(error), detail),
      latencyMs: Date.now() - started,
      status: errorStatus(error),
      error: detail.slice(0, 200),
    };
  } finally {
    // Cleared rather than left to run out its course, so a fast probe does not
    // leave a pending timer behind holding the loop open.
    if (timer) clearTimeout(timer);
  }
}

/** Runs `worker` over `items`, at most `limit` at a time, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const runners = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!);
      }
    },
  );

  await Promise.all(runners);
  return results;
}
