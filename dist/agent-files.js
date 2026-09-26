import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ROUTER_AGENT_PREFIX } from "./types";
/**
 * Materialises `model-router/<agent>` as Markdown agent files under
 * `~/.config/opencode/agents/`, because `AgentEditor` has no `add` and the
 * transform can only update an agent that already exists. A nested path becomes
 * the agent id.
 *
 * Never overwrites, and prunes only files still byte-for-byte what this module
 * would write: a `model` in the frontmatter would beat the transform, and a
 * hand-edited file is the user's, not ours to delete.
 */
/**
 * Roles that should also be selectable as a session's primary agent. Everything
 * else is a `subagent`: with nine routed roles, letting all of them be picked as
 * the main agent turns the agent picker into noise.
 */
const PRIMARY_ROLES = new Set(["orchestrator"]);
/** Agent ids become file names; anything outside this set is not written. */
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
function agentsDir() {
    const configHome = process.env.XDG_CONFIG_HOME?.trim();
    const base = configHome && configHome.length > 0
        ? configHome
        : join(homedir(), ".config");
    // The prefix carries its own trailing slash; `join` normalises it away.
    return join(base, "opencode", "agents", ROUTER_AGENT_PREFIX);
}
function document(name) {
    const mode = PRIMARY_ROLES.has(name) ? "all" : "subagent";
    return [
        "---",
        `description: The ${name} role, with its model chosen and health-tracked by the model router. Dispatch this instead of the unprefixed ${name} to get automatic re-routing.`,
        `mode: ${mode}`,
        "---",
        "",
        `You are the \`${name}\` role.`,
        "",
        "The model behind this role is managed for you: the opencode-agent-router",
        "plugin picks it from the catalog, tracks its health, and will point it at a",
        "different model on a later refresh. Do not assume a particular model,",
        "provider, or context size, and do not ask which model you are — the answer",
        "is not stable and is not the task.",
        "",
        "Everything else about the role is unchanged: do the work it describes, with",
        "the tools you are given.",
        "",
    ].join("\n");
}
/**
 * Reconcile the routed agent files with the roles the router actually routes.
 *
 * Creates what is missing, removes what is provably ours and no longer wanted.
 * Best-effort throughout: a read-only or missing config directory must not stop
 * the router, it just means the transform has nothing to update and says so.
 */
export function syncRoutedAgents(names, onWarn = () => { }) {
    const created = [];
    const removed = [];
    const kept = [];
    const dir = agentsDir();
    try {
        mkdirSync(dir, { recursive: true });
    }
    catch (error) {
        onWarn(`could not create ${dir}: ${describeError(error)}`);
        return { created, removed, kept };
    }
    const routed = new Set();
    for (const name of names) {
        if (!SAFE_NAME.test(name)) {
            onWarn(`skipping agent ${name}: not a safe file name`);
            continue;
        }
        routed.add(name);
        const file = join(dir, `${name}.md`);
        if (existsSync(file))
            continue;
        try {
            writeFileSync(file, document(name), "utf8");
            created.push(`${ROUTER_AGENT_PREFIX}${name}`);
        }
        catch (error) {
            onWarn(`could not write ${file}: ${describeError(error)}`);
        }
    }
    for (const entry of agentFiles(dir)) {
        const name = entry.slice(0, -".md".length);
        if (routed.has(name))
            continue;
        const file = join(dir, entry);
        let current;
        try {
            current = readFileSync(file, "utf8");
        }
        catch (error) {
            onWarn(`could not read ${file}: ${describeError(error)}`);
            continue;
        }
        // Delete only what is still exactly what we would have written. A file the
        // user edited, or wrote themselves, is reported and left alone: a leftover
        // agent is cosmetic, a deleted hand-written prompt is lost work.
        if (current !== document(name)) {
            kept.push(`${ROUTER_AGENT_PREFIX}${name}`);
            onWarn(`keeping ${file}: it is not the router's own, so removing it is left to you`);
            continue;
        }
        try {
            rmSync(file);
            removed.push(`${ROUTER_AGENT_PREFIX}${name}`);
        }
        catch (error) {
            onWarn(`could not remove ${file}: ${describeError(error)}`);
        }
    }
    return { created, removed, kept };
}
/** `*.md` agent files in `dir`, ignoring dotfiles and non-agent names. */
function agentFiles(dir) {
    try {
        return readdirSync(dir).filter((entry) => entry.endsWith(".md") &&
            !entry.startsWith(".") &&
            SAFE_NAME.test(entry.slice(0, -".md".length)));
    }
    catch {
        // An unreadable directory simply has nothing to prune.
        return [];
    }
}
function describeError(error) {
    return error instanceof Error ? error.message : String(error);
}
