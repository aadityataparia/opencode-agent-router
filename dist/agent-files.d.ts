export interface AgentSync {
    /** Ids written because no file existed for them. */
    readonly created: string[];
    /** Files removed because the role is no longer routed and the file was ours. */
    readonly removed: string[];
    /** Stale files kept because their contents are not what we would have written. */
    readonly kept: string[];
}
/**
 * Reconcile the routed agent files with the roles the router actually routes.
 *
 * Creates what is missing, removes what is provably ours and no longer wanted.
 * Best-effort throughout: a read-only or missing config directory must not stop
 * the router, it just means the transform has nothing to update and says so.
 */
export declare function syncRoutedAgents(names: readonly string[], onWarn?: (message: string) => void): AgentSync;
