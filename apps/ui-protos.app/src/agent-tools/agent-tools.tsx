import { Button, Card, cn, Input } from "@statewalker/ui.view.shadcn";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Globe,
  type LucideIcon,
  Mail,
  NotebookPen,
  Presentation,
  RotateCcw,
  ScanSearch,
  Search,
  Sheet,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { today } from "../mock.js";
import {
  type Access,
  type AccessSettings,
  accesses,
  acknowledge,
  agentToolList,
  countAccess,
  effectiveAccess,
  filterSources,
  groupAccess,
  isCustomized,
  newCommands,
  type Risk,
  resetToDefaults,
  type SourceKind,
  setCommandAccess,
  setGroupAccess,
  type ToolCommand,
  type ToolSource,
} from "./access-model.js";
import { claireSettings, lastUsed, toolSources } from "./mock-tools.js";

/**
 * How the commands are laid out:
 * - `rows`: every command is a row with its own three-way control, under its group's control;
 * - `groups`: one control per group; the commands open below it for overrides.
 */
export type ToolsVariant = "rows" | "groups";

export interface AgentToolsProps {
  variant?: ToolsVariant;
  sources?: ToolSource[];
  /** The choices to start from. */
  settings?: AccessSettings;
  /** When the agent last used each command, by key. */
  used?: Record<string, Date>;
  query?: string;
  /** "Now"; `today` from the mock by default. */
  now?: Date;
}

const accessWords: Record<Access, string> = { allow: "Allow", ask: "Ask", block: "Block" };

const accessOn: Record<Access, string> = {
  allow: "bg-success text-white",
  ask: "bg-warning text-black",
  block: "bg-destructive text-white",
};

const riskWords: Record<Risk, string> = {
  deletes: "Deletes",
  overwrites: "Overwrites",
  sends: "Sends",
  leaves: "Leaves this computer",
};

const kindWords: Record<SourceKind, string> = {
  basic: "Basic set",
  connector: "Connector",
  app: "App in this browser",
};

const sourceIcons: Record<string, LucideIcon> = {
  files: FolderOpen,
  indexes: ScanSearch,
  notes: NotebookPen,
  mail: Mail,
  sites: Globe,
  spreadsheet: Sheet,
  slides: Presentation,
};

const DAY = 24 * 60 * 60 * 1000;

function usedText(at: Date, now: Date) {
  const days = Math.floor(now.getTime() / DAY) - Math.floor(at.getTime() / DAY);
  return days <= 0 ? "Used today" : days === 1 ? "Used yesterday" : `Used ${days} days ago`;
}

/** Allow / Ask / Block. */
function AccessControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Access;
  onChange: (access: Access) => void;
}) {
  return (
    <fieldset
      aria-label={`Access for ${label}`}
      className="bg-secondary flex shrink-0 rounded-md p-0.5"
    >
      {accesses.map((a) => (
        <button
          key={a}
          type="button"
          aria-pressed={value === a}
          onClick={() => onChange(a)}
          className={cn(
            "h-7 rounded px-2.5 text-xs font-medium",
            value === a ? accessOn[a] : "text-muted-foreground hover:bg-accent",
          )}
        >
          {accessWords[a]}
        </button>
      ))}
    </fieldset>
  );
}

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

interface RowProps {
  source: ToolSource;
  command: ToolCommand;
  settings: AccessSettings;
  used: Record<string, Date>;
  now: Date;
  onChange: (key: string, access: Access | undefined) => void;
}

function CommandRow({ source, command, settings, used, now, onChange }: RowProps) {
  const title = command.label ?? command.key;
  const own = settings.commands[command.key] !== undefined;
  const isNew = source.loaded && !settings.known.includes(command.key);
  const usedAt = used[command.key];
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 border-t px-4 py-3">
      <div className="min-w-48 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{title}</span>
          {command.risk && (
            <Tag className="bg-warning/15 text-foreground">
              <TriangleAlert className="text-warning size-3" />
              {riskWords[command.risk]}
            </Tag>
          )}
          {isNew && (
            <Tag className="bg-primary/10 text-primary">
              <Sparkles className="size-3" />
              New
            </Tag>
          )}
        </div>
        {command.description && (
          <p className="text-muted-foreground text-sm">{command.description}</p>
        )}
        <p className="text-muted-foreground text-xs">
          <code className="font-mono">{command.key}</code>
          {usedAt && ` · ${usedText(usedAt, now)}`}
          {own && (
            <>
              {" · Own choice · "}
              <button
                type="button"
                onClick={() => onChange(command.key, undefined)}
                className="underline underline-offset-2"
              >
                Follow the group
              </button>
            </>
          )}
        </p>
      </div>
      <AccessControl
        label={title}
        value={effectiveAccess(source, command, settings)}
        onChange={(a) => onChange(command.key, a)}
      />
    </li>
  );
}

function GroupSection({
  source,
  settings,
  variant,
  open,
  onToggle,
  onGroup,
  rowProps,
}: {
  source: ToolSource;
  settings: AccessSettings;
  variant: ToolsVariant;
  open: boolean;
  onToggle: () => void;
  onGroup: (access: Access) => void;
  rowProps: Omit<RowProps, "source" | "command">;
}) {
  const Icon = sourceIcons[source.id] ?? Sparkles;
  const counts = countAccess(source, settings);
  const own = source.commands.filter((c) => settings.commands[c.key]).length;
  const asking = source.commands.filter(
    (c) => c.risk && effectiveAccess(source, c, settings) === "ask",
  );
  const showRows = variant === "rows" || open;
  return (
    <section
      aria-label={source.title}
      className={cn("border-b last:border-b-0", !source.loaded && "opacity-60")}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
        <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
        <div className="min-w-40 flex-1">
          <h3 className="font-semibold">{source.title}</h3>
          <p className="text-muted-foreground text-xs">
            {kindWords[source.kind]} · {counts.allow} allowed · {counts.ask} ask · {counts.block}{" "}
            blocked
            {own > 0 && ` · ${own} own choice${own > 1 ? "s" : ""}`}
          </p>
          {!source.loaded && <p className="text-sm">Not loaded now — your choices are kept</p>}
          {variant === "groups" && asking.length > 0 && (
            <p className="text-muted-foreground text-xs">
              Always asks first: {asking.map((c) => c.label ?? c.key).join(", ")}
            </p>
          )}
        </div>
        <AccessControl
          label={source.title}
          value={groupAccess(source, settings)}
          onChange={onGroup}
        />
      </div>
      {variant === "groups" && (
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-4 pb-3 pl-12 text-xs"
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {open ? "Hide" : "Show"} its {source.commands.length} commands
        </button>
      )}
      {showRows && (
        <ul className={cn(variant === "groups" && "bg-muted/30")}>
          {source.commands.map((command) => (
            <CommandRow key={command.key} source={source} command={command} {...rowProps} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function AgentTools({
  variant = "rows",
  sources = toolSources,
  settings: initialSettings = claireSettings,
  used = lastUsed,
  query: initialQuery = "",
  now = today,
}: AgentToolsProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [query, setQuery] = useState(initialQuery);
  const [opened, setOpened] = useState<string[]>([]);

  const tools = agentToolList(sources, settings);
  const asking = tools.filter((t) => t.ask).length;
  const blocked =
    sources.filter((s) => s.loaded).reduce((n, s) => n + s.commands.length, 0) - tools.length;
  const shown = filterSources(sources, query);
  const arrivals = newCommands(sources, settings);
  const searching = query.trim() !== "";

  return (
    <Card className="w-full max-w-2xl gap-0 py-0">
      <div className="grid gap-3 border-b p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">Agent tools</h2>
          <Button
            size="sm"
            variant="ghost"
            disabled={!isCustomized(settings)}
            onClick={() => setSettings(resetToDefaults(settings))}
          >
            <RotateCcw />
            Reset to defaults
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          What the assistant on this computer may do. Files, indexes, notes and todos are allowed;
          anything that deletes, overwrites, sends or leaves this computer asks each time.
        </p>
        <p className="text-sm" aria-live="polite">
          The agent can use <strong>{tools.length}</strong> commands now · {asking} ask each time ·{" "}
          {blocked} blocked
        </p>
        {arrivals.map(({ source, keys }) => (
          <div
            key={source.id}
            role="status"
            className="border-primary/40 bg-primary/5 flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
          >
            <Sparkles className="text-primary size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              {source.title} added {keys.length} command{keys.length > 1 ? "s" : ""} — they ask each
              time until you decide.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSettings(acknowledge(settings, keys))}
            >
              Got it
            </Button>
          </div>
        ))}
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            aria-label="Search commands"
            placeholder="Search commands, e.g. “delete” or “mail”"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground p-8 text-center text-sm">
          No command matches “{query.trim()}”
        </p>
      ) : (
        shown.map((source) => (
          <GroupSection
            key={source.id}
            source={source}
            settings={settings}
            variant={variant}
            open={searching || opened.includes(source.id)}
            onToggle={() =>
              setOpened(
                opened.includes(source.id)
                  ? opened.filter((id) => id !== source.id)
                  : [...opened, source.id],
              )
            }
            onGroup={(a) => setSettings(setGroupAccess(settings, source.id, a))}
            rowProps={{
              settings,
              used,
              now,
              onChange: (key, a) => setSettings(setCommandAccess(settings, key, a)),
            }}
          />
        ))
      )}
    </Card>
  );
}
