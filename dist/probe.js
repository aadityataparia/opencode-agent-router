/** Smallest completion that still exercises the full request path. */
const PROMPT = "ping";
/** Pulls the gateway's error `type` out of an OpenAI-shaped error body. */
function errorType(body) {
    try {
        const parsed = JSON.parse(body);
        return parsed.error?.type;
    }
    catch {
        return undefined;
    }
}
function classify(status, type) {
    // The gateway reports a missing/unknown model as a ModelError, which is the
    // one failure that really is about the model.
    if (type === "ModelError")
        return "unusable";
    // A rejected credential is the provider's problem, not the model's, but the
    // model still cannot answer routed traffic — so it is excluded and the
    // provider gets reported for re-connection.
    if (type === "AuthError")
        return "unauthorized";
    if (status === 401 || status === 403)
        return "unauthorized";
    // Throttling is transient and says nothing about the model.
    if (status === 429)
        return "inconclusive";
    // 404/400 mean the endpoint will not serve this model; 5xx means it tried.
    return "unusable";
}
export async function probeModel(model, options) {
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
            error: detail.slice(0, 200) ||
                response.statusText ||
                `HTTP ${response.status}`,
        };
    }
    catch (error) {
        return {
            verdict: "unusable",
            latencyMs: Date.now() - started,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
/** Runs `worker` over `items`, at most `limit` at a time, preserving order. */
export async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        for (;;) {
            const index = next++;
            if (index >= items.length)
                return;
            results[index] = await worker(items[index]);
        }
    });
    await Promise.all(runners);
    return results;
}
