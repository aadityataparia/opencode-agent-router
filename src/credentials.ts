import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolving an OpenCode integration's API key, so a router alias can
 * authenticate to a provider that requires one.
 *
 * The gap this fills: `Provider.Info` carries an `integrationID` but no key, and
 * `Model.Info` has no `integrationID` field at all — so OpenCode has nothing to
 * resolve a credential from when a model is published by a plugin. The alias
 * reaches the provider with the right `baseURL` and no `Authorization`, and is
 * refused with a 401 on first use.
 *
 * The only source left is OpenCode's own credential store. The protocol exposes
 * no read for it (`server.credential` ships only `credential.update`), so this
 * reads the store directly. That is a private, undocumented schema, and it is
 * the reason the whole path is opt-in and best-effort:
 *
 *   - Opt-in through the `credentials` option. Reading another process's stored
 *     secrets is not a thing to do by default.
 *   - Any failure resolves to "no credential", which makes the caller skip
 *     aliasing that provider. It never degrades into an alias that would fail on
 *     first use.
 *   - Only `{ type: "key" }` credentials are used. An OAuth credential holds an
 *     access token that expires; freezing a copy into a long-lived alias would
 *     produce an alias that dies silently at expiry with nothing to refresh it.
 *   - The key itself is never logged, never rendered, and never reaches the TUI
 *     or `/router` output. Callers get the finished header plus a fingerprint
 *     that is safe to print.
 */

export interface ResolvedCredential {
  /** Ready-to-use header value, e.g. `Bearer sk-or-...`. */
  authorization: string;
  /** First 8 hex of sha256 — correlatable in a log, useless as a credential. */
  fingerprint: string;
}

/** Only the active credential for this integration; the store allows several. */
const SQL =
  "select value from credential where integration_id = ? and active = 1 limit 1";

function storePath(): string {
  const dataHome = process.env.XDG_DATA_HOME?.trim();
  const base =
    dataHome && dataHome.length > 0 ? dataHome : join(homedir(), ".local", "share");
  return join(base, "opencode", "opencode.db");
}

/** Short, non-reversible id for a secret, for logs and diagnostics. */
export function fingerprint(value: string): string {
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
export async function resolveCredential(
  integrationID: string,
): Promise<ResolvedCredential | undefined> {
  let db: { query(sql: string): { get(...params: unknown[]): unknown }; close(): void } | undefined;
  try {
    const { Database } = await import("bun:sqlite");
    db = new Database(storePath(), { readonly: true });

    const row = db.query(SQL).get(integrationID) as
      | { value?: unknown }
      | null
      | undefined;
    if (!row || typeof row.value !== "string") return undefined;

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      return undefined;
    }
    if (!parsed || typeof parsed !== "object") return undefined;

    const value = parsed as { type?: unknown; key?: unknown };
    if (value.type !== "key" || typeof value.key !== "string") return undefined;

    const key = value.key.trim();
    if (key.length === 0) return undefined;

    return { authorization: `Bearer ${key}`, fingerprint: fingerprint(key) };
  } catch {
    return undefined;
  } finally {
    try {
      db?.close();
    } catch {
      // Never opened, or already closed. Nothing to release either way.
    }
  }
}
