import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
/** Only the active credential for this integration; the store allows several. */
const SQL = "select value from credential where integration_id = ? and active = 1 limit 1";
function storePath() {
    const dataHome = process.env.XDG_DATA_HOME?.trim();
    const base = dataHome && dataHome.length > 0 ? dataHome : join(homedir(), ".local", "share");
    return join(base, "opencode", "opencode.db");
}
/** Short, non-reversible id for a secret, for logs and diagnostics. */
export function fingerprint(value) {
    return createHash("sha256").update(value).digest("hex").slice(0, 8);
}
/**
 * Resolve the API key for `integrationID`, or `undefined` when there is none
 * this plugin is willing to use.
 *
 * Never throws: an unreadable store, a missing row, a locked database, an
 * unparseable value, or a credential of the wrong shape all resolve to
 * `undefined`, because the caller's safe response to "cannot authenticate" is to
 * not publish the alias at all.
 */
export async function resolveCredential(integrationID) {
    let db;
    try {
        const { Database } = await import("bun:sqlite");
        db = new Database(storePath(), { readonly: true });
        const row = db.query(SQL).get(integrationID);
        if (!row || typeof row.value !== "string")
            return undefined;
        let parsed;
        try {
            parsed = JSON.parse(row.value);
        }
        catch {
            return undefined;
        }
        if (!parsed || typeof parsed !== "object")
            return undefined;
        const value = parsed;
        if (value.type !== "key" || typeof value.key !== "string")
            return undefined;
        const key = value.key.trim();
        if (key.length === 0)
            return undefined;
        return { authorization: `Bearer ${key}`, fingerprint: fingerprint(key) };
    }
    catch {
        return undefined;
    }
    finally {
        try {
            db?.close();
        }
        catch {
            // Never opened, or already closed. Nothing to release either way.
        }
    }
}
