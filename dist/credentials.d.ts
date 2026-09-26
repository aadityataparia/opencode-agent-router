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
/** Short, non-reversible id for a secret, for logs and diagnostics. */
export declare function fingerprint(value: string): string;
/**
 * Resolve the API key for `integrationID`, or `undefined` when there is none
 * this plugin is willing to use.
 *
 * Never throws: an unreadable store, a missing row, a locked database, an
 * unparseable value, or a credential of the wrong shape all resolve to
 * `undefined`, because the caller's safe response to "cannot authenticate" is to
 * not publish the alias at all.
 */
export declare function resolveCredential(integrationID: string): Promise<ResolvedCredential | undefined>;
