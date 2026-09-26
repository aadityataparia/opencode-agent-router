import type { DiscoveredModel, RouterConfig } from "./types";

/**
 * Parsing and rendering for the `/router` slash command.
 *
 * Everything here is pure: it takes the text the user typed plus a snapshot of
 * router state, and returns either a decision or a block of Markdown. The
 * command handler in `index.ts` owns the mutable state and the side effects.
 *
 * Output goes to the session as a *synthetic* message rather than a prompt, so
 * showing status or applying a pin costs no model call and cannot be ignored or
 * paraphrased by the model.
 */

export const ROUTER_COMMAND = "router";

export type ParsedCommand =
  | { kind: "status" }
  | { kind: "help" }
  | { kind: "refresh" }
  | { kind: "pin"; agent: string; model: string }
  | { kind: "unpin"; agent: string }
  | { kind: "unpin-all" }
  | { kind: "error"; message: string };

/** Split on whitespace. Model IDs never contain spaces, so quoting buys nothing. */
function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter((token) => token.length > 0);
}

export function parseCommand(text: string): ParsedCommand {
  const tokens = tokenize(text);
  // A bare `/router` is the common case, and status is what a user asking
  // "what is this thing doing right now" wants.
  if (tokens.length === 0) return { kind: "status" };

  const [action, ...rest] = tokens;
  const verb = action.toLowerCase();

  if (verb === "status" || verb === "show" || verb === "list") {
    return rest.length === 0
      ? { kind: "status" }
      : { kind: "error", message: `\`status\` takes no arguments.` };
  }

  if (verb === "refresh" || verb === "reload" || verb === "rescan") {
    return rest.length === 0
      ? { kind: "refresh" }
      : { kind: "error", message: `\`refresh\` takes no arguments.` };
  }

  if (verb === "help" || verb === "?") return { kind: "help" };

  if (verb === "unpin") {
    if (rest.length === 0) return { kind: "unpin-all" };
    if (rest.length > 1) {
      return { kind: "error", message: `\`unpin\` takes one agent. Use \`/router unpin\` to clear every pin.` };
    }
    return { kind: "unpin", agent: rest[0] };
  }

  if (verb === "reset") return { kind: "unpin-all" };

  if (verb === "pin") {
    if (rest[0] === "--clear" || rest[0] === "clear") return { kind: "unpin-all" };
    if (rest.length < 2) {
      return {
        kind: "error",
        message: `\`pin\` needs an agent and a model: \`/router pin ${"explorer"} ${"opencode/model-id"}\`. Use \`/router unpin\` to clear every pin.`,
      };
    }
    if (rest.length > 2) {
      return {
        kind: "error",
        message: `\`pin\` takes exactly one agent and one model; got ${rest.length} arguments.`,
      };
    }
    return { kind: "pin", agent: rest[0], model: rest[1] };
  }

  return {
    kind: "error",
    message: `Unknown action \`${action}\`. Run \`/router help\` for the list.`,
  };
}

/** Canonical `provider/model` identity used for pins and display. */
export function modelRef(
  model: Pick<DiscoveredModel, "providerID" | "id" | "modelID">,
): string {
  return `${model.providerID}/${model.modelID ?? model.id}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve a user-typed model reference against the catalog.
 *
 * Accepts `provider/model` and a bare `model`, because listing 37 models to
 * find the one provider prefix is busywork. A bare name is only accepted when it
 * is unambiguous; silently picking one of several same-named models across
 * providers would route an agent somewhere the user did not choose.
 */
export function findModel(
  models: readonly DiscoveredModel[],
  ref: string,
): DiscoveredModel | undefined {
  const wanted = normalize(ref);

  const byQualified = models.filter(
    (model) => normalize(modelRef(model)) === wanted,
  );
  if (byQualified.length > 0) return byQualified[0];

  const byBare = models.filter(
    (model) =>
      normalize(model.id) === wanted ||
      (model.modelID !== undefined && normalize(model.modelID) === wanted),
  );
  if (byBare.length === 1) return byBare[0];

  return undefined;
}

/** How many models a bare reference is ambiguous between, for a better error. */
export function countMatches(
  models: readonly DiscoveredModel[],
  ref: string,
): number {
  const wanted = normalize(ref);
  return models.filter(
    (model) =>
      normalize(model.id) === wanted ||
      (model.modelID !== undefined && normalize(model.modelID) === wanted) ||
      normalize(modelRef(model)) === wanted,
  ).length;
}

export interface StatusView {
  config: RouterConfig;
  /** Agent -> chosen model for the aliases currently published. */
  assignments: ReadonlyMap<string, DiscoveredModel>;
  /** Agent -> pinned model ref. */
  pins: ReadonlyMap<string, string>;
  /** Agents eligible for routing under the active presets. */
  routedAgents: readonly string[];
  discovered: number;
  /** Models left in the pool after probing. */
  routable: number;
  coolingDown: number;
  /** Provider -> models rejected for auth, sticky across passes. */
  authBlocked: readonly (readonly [string, number])[];
  lastRun: { at: number; reason: string; probed: number; usable: number } | undefined;
  refreshMs: number;
  now: number;
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function healthCell(model: DiscoveredModel, now: number): string {
  if (model.cooldownUntil && model.cooldownUntil > now) {
    return `${model.health.toFixed(2)} (cooling)`;
  }
  return model.health.toFixed(2);
}

export function formatStatus(view: StatusView): string {
  const { config } = view;
  const lines: string[] = [];

  lines.push(
    `**model-router** · ${config.strategy} · probe ${config.probe ? "on" : "off"} · presets: ${config.presets.join(", ") || "none detected"}`,
  );
  lines.push("");

  const routed = view.routedAgents;
  if (routed.length === 0) {
    lines.push(
      "No agents are in scope. Set `presets` in the plugin options, or declare an `agents` entry.",
    );
  } else {
    lines.push("| agent | model | health | note |");
    lines.push("| --- | --- | --- | --- |");

    for (const agent of routed) {
      const model = view.assignments.get(agent);
      const pin = view.pins.get(agent);

      if (!model) {
        const note = pin ? "pinned model unavailable" : "no candidate";
        lines.push(`| \`${agent}\` | — | — | ${note} |`);
        continue;
      }

      const notes: string[] = [];
      if (pin) {
        // A pin that no longer resolves would otherwise look identical to a
        // satisfied one, which is the kind of thing that goes unnoticed for days.
        notes.push(
          normalize(modelRef(model)) === normalize(pin)
            ? "pinned"
            : `pin \`${pin}\` unavailable, routed instead`,
        );
      }
      if (view.authBlocked.some(([provider]) => provider === model.providerID)) {
        notes.push("auth blocked");
      }

      lines.push(
        `| \`${agent}\` | \`${modelRef(model)}\` | ${healthCell(model, view.now)} | ${notes.join("; ") || "—"} |`,
      );
    }
  }

  lines.push("");
  lines.push(
    `${view.discovered} model(s) discovered · ${view.routable} routable · ${view.coolingDown} cooling down`,
  );

  if (view.authBlocked.length > 0) {
    const detail = view.authBlocked
      .map(([provider, count]) => `\`${provider}\` (${count})`)
      .join(", ");
    lines.push(
      `⚠ auth blocked: ${detail} — reconnect with \`opencode auth login\``,
    );
  }

  if (view.lastRun) {
    const { at, reason, probed, usable } = view.lastRun;
    const probeNote = config.probe ? ` · probed ${usable}/${probed} usable` : "";
    lines.push(
      `last refresh ${formatDuration(view.now - at)} ago (${reason})${probeNote} · next in ${formatDuration(config.refreshMs)}`,
    );
  } else {
    lines.push(`no refresh has completed yet · next in ${formatDuration(config.refreshMs)}`);
  }

  return lines.join("\n");
}

export const HELP_TEXT = [
  "**/router** — inspect and steer the model router",
  "",
  "| command | effect |",
  "| --- | --- |",
  "| `/router` | show routing status |",
  "| `/router refresh` | re-scan providers and re-probe now, ignoring probe cache and cooldown |",
  "| `/router pin <agent> <model>` | force one agent onto one model |",
  "| `/router unpin <agent>` | drop one pin |",
  "| `/router unpin` | drop every pin |",
  "",
  "Pins live in memory for this session only and are lost on restart. For a",
  "permanent change, set `presets` in the plugin options or point the agent at",
  "`model-router/<agent>` directly.",
].join("\n");
