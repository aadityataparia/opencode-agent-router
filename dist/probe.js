/** Smallest completion that still exercises the full request path. */
const PROMPT = "ping";
/** Pull a numeric HTTP status out of whatever shape the error arrived in. */
function errorStatus(error) {
    if (typeof error !== "object" || error === null)
        return undefined;
    const record = error;
    for (const key of ["status", "statusCode", "code"]) {
        const value = record[key];
        if (typeof value === "number" && value >= 100 && value < 600)
            return value;
        if (typeof value === "string" && /^\d{3}$/.test(value))
            return Number(value);
    }
    return undefined;
}
function describe(error) {
    if (error instanceof Error)
        return `${error.name}: ${error.message}`;
    if (typeof error === "object" && error !== null) {
        try {
            return JSON.stringify(error);
        }
        catch {
            return String(error);
        }
    }
    return String(error);
}
/**
 * A failed generate call carries no structured error type, so the verdict is
 * matched textually; the status code is preferred where one is present.
 */
function classify(status, detail) {
    if (status === 429 ||
        /\b(429)\b/.test(detail) ||
        /rate.?limit|too many requests/i.test(detail)) {
        if (/per.?second|per.?minute/i.test(detail))
            return "inconclusive";
        return "unusable";
    }
    // Not the model's fault, but it cannot serve traffic until the provider is back.
    if (status === 401 || status === 403)
        return "unauthorized";
    if (/\b(401|403)\b/.test(detail) ||
        /unauthoriz|forbidden|authenticat|invalid api.?key|missing api.?key|credential|permission.?denied/i.test(detail)) {
        return "unauthorized";
    }
    // Everything else means the endpoint will not serve this model.
    return "unusable";
}
export async function probeModel(model, providerID, options) {
    const started = Date.now();
    let timer;
    try {
        // No abort signal on OpenCode's generate call, so the timeout is enforced
        // here and the loser's result is dropped.
        const call = options.generate({
            prompt: PROMPT,
            model: { providerID, id: model.modelID ?? model.id },
        });
        const timeout = new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`probe timed out after ${options.timeoutMs}ms`)), options.timeoutMs);
        });
        await Promise.race([call, timeout]);
        return { verdict: "ok", latencyMs: Date.now() - started };
    }
    catch (error) {
        const detail = describe(error);
        return {
            verdict: classify(errorStatus(error), detail),
            latencyMs: Date.now() - started,
            status: errorStatus(error),
            error: detail.slice(0, 200),
        };
    }
    finally {
        // Cleared rather than left to run out its course, so a fast probe does not
        // leave a pending timer behind holding the loop open.
        if (timer)
            clearTimeout(timer);
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
