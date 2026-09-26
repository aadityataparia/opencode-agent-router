import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ROUTER_AGENT_PREFIX } from "./types";

/**
 * Writes `model-router/<agent>` Markdown files under `~/.config/opencode/agents/`,
 * since `AgentEditor` has no `add`. Never overwrites, and prunes only files still
 * byte-for-byte what this module would write.
 */

/** Roles that may also run as a session's primary agent; the rest are subagents. */
const PRIMARY_ROLES = new Set(["orchestrator"]);

/** Agent ids become file names; anything outside this set is not written. */
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

function agentsDir(): string {
  const configHome = process.env.XDG_CONFIG_HOME?.trim();
  const base =
    configHome && configHome.length > 0
      ? configHome
      : join(homedir(), ".config");
  // The prefix carries its own trailing slash; `join` normalises it away.
  return join(base, "opencode", "agents", ROUTER_AGENT_PREFIX);
}

function document(name: string, model?: string): string {
  const mode = PRIMARY_ROLES.has(name) ? "all" : "subagent";
  return [
    "---",
    `description: The ${name} role, with its model chosen and health-tracked by the model router. Dispatch this instead of the unprefixed ${name} to get automatic re-routing.`,
    `mode: ${mode}`,
    // Written here as well as through the transform: agent files are read while
    // config loads, before any session exists. A cold `opencode run` otherwise
    // resolves the agent before async setup can assign one, and falls back to
    // the session's own model.
    ...(model ? [`model: ${model}`] : []),
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
 * True when `current` is this module's own file, with or without a model line.
 * Anything else was edited by the user, and is never rewritten or removed.
 */
function isOurs(name: string, current: string): boolean {
  return current.replace(/^model: .*\n/m, "") === document(name);
}

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
export function syncRoutedAgents(
  names: readonly string[],
  models: ReadonlyMap<string, string> = new Map(),
  onWarn: (message: string) => void = () => {},
): AgentSync {
  const created: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  const kept: string[] = [];
  const dir = agentsDir();

  try {
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    onWarn(`could not create ${dir}: ${describeError(error)}`);
    return { created, updated, removed, kept };
  }

  const routed = new Set<string>();
  for (const name of names) {
    if (!SAFE_NAME.test(name)) {
      onWarn(`skipping agent ${name}: not a safe file name`);
      continue;
    }
    routed.add(name);

    const file = join(dir, `${name}.md`);
    const ref = models.get(name);
    const wanted = document(name, ref);

    if (existsSync(file)) {
      let current: string;
      try {
        current = readFileSync(file, "utf8");
      } catch (error) {
        onWarn(`could not read ${file}: ${describeError(error)}`);
        continue;
      }
      // Rewrite only our own file, and only when the model actually moved. A
      // hand-edited file is left exactly as it is.
      if (current !== wanted && isOurs(name, current)) {
        try {
          writeFileSync(file, wanted, "utf8");
          updated.push(`${ROUTER_AGENT_PREFIX}${name}`);
        } catch (error) {
          onWarn(`could not update ${file}: ${describeError(error)}`);
        }
      }
      continue;
    }

    try {
      writeFileSync(file, wanted, "utf8");
      created.push(`${ROUTER_AGENT_PREFIX}${name}`);
    } catch (error) {
      onWarn(`could not write ${file}: ${describeError(error)}`);
    }
  }

  for (const entry of agentFiles(dir)) {
    const name = entry.slice(0, -".md".length);
    if (routed.has(name)) continue;

    const file = join(dir, entry);
    let current: string;
    try {
      current = readFileSync(file, "utf8");
    } catch (error) {
      onWarn(`could not read ${file}: ${describeError(error)}`);
      continue;
    }

    // Only ever delete a file still byte-for-byte what we would have written.
    if (!isOurs(name, current)) {
      kept.push(`${ROUTER_AGENT_PREFIX}${name}`);
      onWarn(
        `keeping ${file}: it is not the router's own, so removing it is left to you`,
      );
      continue;
    }
    try {
      rmSync(file);
      removed.push(`${ROUTER_AGENT_PREFIX}${name}`);
    } catch (error) {
      onWarn(`could not remove ${file}: ${describeError(error)}`);
    }
  }

  return { created, updated, removed, kept };
}

/** `*.md` agent files in `dir`, ignoring dotfiles and non-agent names. */
function agentFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter(
      (entry) =>
        entry.endsWith(".md") &&
        !entry.startsWith(".") &&
        SAFE_NAME.test(entry.slice(0, -".md".length)),
    );
  } catch {
    // An unreadable directory simply has nothing to prune.
    return [];
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
