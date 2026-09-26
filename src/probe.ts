import type { DiscoveredModel } from "./types.js";

/**
 * Reachability probing.
 *
 * The catalog says a model exists; it does not say the model answers. A model
 * that is published but dead still looks like the best candidate on paper, and
 * routing to it fails on the first real request. A one-token ping turns that
 * into a fact the router can act on before it picks anything.
 */

/**
 * `unusable` is a verdict about the model. `inconclusive` means the probe could
 * not tell: a rejected credential or a throttled endpoint says nothing about
 * whether the model works, and must never be allowed to shrink the candidate
 * pool on its own.
 */
export type ProbeVerdict = "ok" | "unusable" | "inconclusive";

export interface ProbeResult {
  readonly verdict: ProbeVerdict;
  readonly latencyMs: number;
  readonly status?: number;
  readonly error?: string;
}

export interface ProbeOptions {
  /** OpenAI-compatible base URL of the endpoint traffic will actually use. */
  readonly baseURL: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
}

/** Smallest completion that still exercises the full request path. */
const PROMPT = "ping";

/** Pulls the gateway's error `type` out of an OpenAI-shaped error body. */
function errorType(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { type?: string } };
    return parsed.error?.type;
  } catch {
    return undefined;
  }
}

function classify(status: number, type: string | undefined): ProbeVerdict {
  // The gateway reports a missing/unknown model as a ModelError, which is the
  // one failure that really is about the model.
  if (type === "ModelError") return "unusable";

  // Credential and throttle failures are endpoint-wide, not model-specific.
  if (type === "AuthError") return "inconclusive";
  if (status === 401 || status === 403 || status === 429) return "inconclusive";

  // 404/400 mean the endpoint will not serve this model; 5xx means it tried.
  return "unusable";
}

export async function probeModel(
  model: Pick<DiscoveredModel, "id" | "modelID">,
  options: ProbeOptions,
): Promise<ProbeResult> {
  const started = Date.now();
  const endpoint = `${options.baseURL.replace(/\/+$/, "")}/chat/completions`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: model.modelID ?? model.id,
        messages: [{ role: "user", content: PROMPT }],
        max_tokens: 1,
        stream: false,
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });

    const latencyMs = Date.now() - started;
    if (response.ok) {
      // The body is irrelevant; drop it so the socket is released.
      await response.body?.cancel();
      return { verdict: "ok", latencyMs };
    }

    const detail = (await response.text().catch(() => "")).trim();
    return {
      verdict: classify(response.status, errorType(detail)),
      latencyMs,
      status: response.status,
      error: detail.slice(0, 200) || response.statusText || `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      verdict: "unusable",
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
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
