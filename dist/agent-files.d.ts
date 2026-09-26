export interface AgentSync {
    /** Ids written because no file existed for them. */
    readonly created: string[];
    /** Ids whose model line was rewritten because routing moved them. */
    readonly updated: string[];
    /** Files removed because the role is no longer routed and the file was ours. */
    readonly removed: string[];
    /** Stale files kept because their contents are not what we would have written. */
    readonly kept: string[];
}
/**
 * Creates missing agent files and prunes ones for roles no longer routed.
 * Best-effort: an unwritable config directory is reported, not thrown.
 */
export declare function syncRoutedAgents(names: readonly string[], models?: ReadonlyMap<string, string>, onWarn?: (message: string) => void): AgentSync;
