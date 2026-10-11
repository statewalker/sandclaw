// What the local agent may call, and how. The agent harness reaches every local
// command through `@statewalker/shared-commands`: each source (files, indexes,
// notes, a connector, an in-browser app) owns a `MutableCommandsRegistry`; the
// sources are joined with `CommandsRegistry.compose(...)`, and the agent's tool
// list is `CommandsRegistry.filter(all, (decl) => access(decl) !== "block")`.
// An app's registry is in the composition only while the app is loaded, so its
// commands appear and disappear; the choices made here are kept by key.

/**
 * The part of a shared-commands `CommandDeclaration` this page reads: `key`,
 * `label`, `description`, `icon` (schemas and policy are the agent's business).
 * `risk` is not in shared-commands: Sandclaw annotates it by key.
 */
export interface ToolCommand {
  key: string;
  label?: string;
  description?: string;
  icon?: string;
  risk?: Risk;
}

/** Why a command asks first by default. */
export type Risk = "deletes" | "overwrites" | "sends" | "leaves";

export type SourceKind = "basic" | "connector" | "app";

/** One registry in the composition. */
export interface ToolSource {
  id: string;
  title: string;
  kind: SourceKind;
  /** For an app that is not loaded: the commands it registered last time. */
  commands: ToolCommand[];
  /** Whether the source's registry is in the composition now. */
  loaded: boolean;
}

export type Access = "allow" | "ask" | "block";

export const accesses: Access[] = ["allow", "ask", "block"];

export interface AccessSettings {
  /** Group-level setting per source id. */
  groups: Record<string, Access>;
  /** Per-command override, by command key. */
  commands: Record<string, Access>;
  /** Command keys the user has seen; any other command is new. */
  known: string[];
}

/** The basic set is allowed; connectors, apps and risky commands ask. */
export function defaultAccess(source: ToolSource, command: ToolCommand): Access {
  if (command.risk) return "ask";
  return groupDefault(source);
}

const groupDefault = (source: ToolSource): Access => (source.kind === "basic" ? "allow" : "ask");

/** The group's own setting, else its default: the basic set allows, the rest asks. */
export function groupAccess(source: ToolSource, settings: AccessSettings): Access {
  return settings.groups[source.id] ?? groupDefault(source);
}

/**
 * Command override ?? (a new command asks until the user has seen it) ?? group
 * setting ?? default.
 */
export function effectiveAccess(
  source: ToolSource,
  command: ToolCommand,
  settings: AccessSettings,
): Access {
  return (
    settings.commands[command.key] ??
    (settings.known.includes(command.key) ? undefined : "ask") ??
    settings.groups[source.id] ??
    defaultAccess(source, command)
  );
}

export function setGroupAccess(
  settings: AccessSettings,
  sourceId: string,
  access: Access,
): AccessSettings {
  return { ...settings, groups: { ...settings.groups, [sourceId]: access } };
}

/** `undefined` drops the override: the command follows its group again. */
export function setCommandAccess(
  settings: AccessSettings,
  key: string,
  access: Access | undefined,
): AccessSettings {
  const { [key]: _, ...rest } = settings.commands;
  return { ...settings, commands: access ? { ...rest, [key]: access } : rest };
}

/** Clears every group setting and override; what the user has seen stays seen. */
export function resetToDefaults(settings: AccessSettings): AccessSettings {
  return { groups: {}, commands: {}, known: settings.known };
}

export function isCustomized(settings: AccessSettings) {
  return Object.keys(settings.groups).length + Object.keys(settings.commands).length > 0;
}

/** Loaded sources that registered commands the user has not seen. */
export function newCommands(sources: ToolSource[], settings: AccessSettings) {
  return sources.flatMap((source) => {
    if (!source.loaded) return [];
    const keys = source.commands.map((c) => c.key).filter((k) => !settings.known.includes(k));
    return keys.length ? [{ source, keys }] : [];
  });
}

export function acknowledge(settings: AccessSettings, keys: string[]): AccessSettings {
  return { ...settings, known: [...new Set([...settings.known, ...keys])] };
}

/** A tool as the agent gets it: blocked commands are left out, asking ones are flagged. */
export interface AgentTool {
  key: string;
  label: string;
  description?: string;
  ask: boolean;
}

export function agentToolList(sources: ToolSource[], settings: AccessSettings): AgentTool[] {
  return sources
    .filter((s) => s.loaded)
    .flatMap((source) =>
      source.commands.flatMap((command) => {
        const access = effectiveAccess(source, command, settings);
        if (access === "block") return [];
        const { key, label = key, description } = command;
        return [{ key, label, description, ask: access === "ask" }];
      }),
    );
}

export function countAccess(source: ToolSource, settings: AccessSettings) {
  const counts: Record<Access, number> = { allow: 0, ask: 0, block: 0 };
  for (const c of source.commands) counts[effectiveAccess(source, c, settings)]++;
  return counts;
}

/** Lower case, accents removed. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Sources with the commands matching the query (title, description or key).
 * A source whose title matches keeps all its commands.
 */
export function filterSources(sources: ToolSource[], query: string): ToolSource[] {
  const q = fold(query.trim());
  if (!q) return sources;
  return sources.flatMap((source) => {
    if (fold(source.title).includes(q)) return [source];
    const commands = source.commands.filter((c) =>
      [c.label, c.description, c.key].some((w) => w && fold(w).includes(q)),
    );
    return commands.length ? [{ ...source, commands }] : [];
  });
}
