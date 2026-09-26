import type { DiscoveredModel } from "./types";

/**
 * Reachability probing.
 *
 * The catalog says a model exists; it does not say the model answers. A model
 * that is published but dead still looks like the best candidate on paper, and
 * routing to it fails on the first real request. A one-token ping turns that
 * into a fact the router can act on before it picks anything.
 *
 * The ping is issued through OpenCode's own generate API rather than by hand
 * building a request. OpenCode already owns provider endpoints, SDK packages and
 * credentials — including credentials held in its auth store, which are not
 * visible in the config file and so cannot be forwarded by the router. Probing
 * the way real traffic is sent is both less code and the only check that
 * reflects what will actually happen at request time.
 */

/**
 * A verdict about one model.
 *
 * - `ok` answered.
 * - `unusable` the endpoint will not serve it.
 * - `unauthorized` the endpoint rejected our credential. Not the model's fault,
 *   but the model still cannot serve routed traffic, so it is excluded and the
 *   provider is reported for re-connection.
 * - `inconclusive` the probe could not tell (a throttled endpoint). Says
 *   nothing about the model, so it must never shrink the pool on its own.
 */
export type ProbeVerdict = "ok" | "unusable" | "unauthorized" | "inconclusive";

export interface ProbeResult {
  readonly verdict: ProbeVerdict;
  readonly latencyMs: number;
  readonly status?: number;
  readonly error?: string;
}

/** Runs one completion against a specific provider's model. */
export type GenerateText = (input: {
  readonly prompt: string;
  readonly model: {
    readonly id: string;
    readonly providerID: string;
    readonly variant?: string;
  };
}) => Promise<{ readonly text: string }>;

export interface ProbeOptions {
  /** OpenCode's generate call, which resolves the endpoint and credentials. */
  readonly generate: GenerateText;
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
    if (typeof value === "string" && /^\d{3}$/.test(value)) return Number(value);
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
 * Read a verdict out of a failed generate call.
 *
 * The old hand-built request could read a structured `error.type` out of the
 * response body. Going through OpenCode means the failure arrives as whatever
 * the provider SDK threw, so the signal is matched textually. That is coarser
 * than a typed field, so the status code is preferred where one is present and
 * the wording is only consulted to separate "your credential is wrong" from
 * "this model is not served" — the two cases that mean different things to the
 * user.
 */
function classify(status: number | undefined, detail: string): ProbeVerdict {
  // Throttling is transient and says nothing about the model.
  if (status === 429) return "inconclusive";
  if (/\b(429)\b/.test(detail) || /rate.?limit|too many requests|quota exceeded/i.test(detail)) {
    return "inconclusive";
  }

  // A rejected credential is the provider's problem, not the model's, but the
  // model still cannot answer routed traffic — so it is excluded and the
  // provider gets reported for re-connection.
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

export async function probeModel(
  model: Pick<DiscoveredModel, "id" | "modelID">,
  providerID: string,
  options: ProbeOptions,
): Promise<ProbeResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    // OpenCode's generate call takes no abort signal, so the timeout is enforced
    // here. The losing request is not cancellable, but its result is dropped and
    // a stalled provider must not hold up the whole refresh pass.
    const call = options.generate({
      prompt: PROMPT,
      model: { providerID, id: model.modelID ?? model.id },
    });

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`probe timed out after ${options.timeoutMs}ms`)),
        options.timeoutMs,
      );
    });

    await Promise.race([call, timeout]);

    return { verdict: "ok", latencyMs: Date.now() - started };
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
