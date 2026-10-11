import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  ScrollArea,
} from "@statewalker/ui.view.shadcn";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CloudOff,
  EyeOff,
  FileImage,
  FileText,
  Folder,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Search,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { FolderEntry } from "../mock.js";
import { ZoneTitle } from "../zone-title.js";
import {
  atelierFolder,
  type Counts,
  countFiles,
  exclude,
  type IndexFile,
  include,
  makeFiles,
  minutesFor,
  reasons,
  reread,
  type Scenario,
  step,
  topFolders,
} from "./reading.js";

export interface IndexingProps {
  scenario?: Scenario;
  /** The Sandclaw machine doesn't answer: reading goes on, understanding waits. */
  offline?: boolean;
  /** Run the scripted reader (a few files a second). Off in tests. */
  live?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const nameOf = (path: string) => path.split("/").pop() ?? path;

/** The reading state of the prototype; each action stands for a call to the reader. */
function useReading({ scenario = "first-reading", offline = false, live = false }: IndexingProps) {
  const [files, setFiles] = useState(() => makeFiles(scenario, offline));
  const [paused, setPaused] = useState(false);
  /** The folder waiting for "forget what was learnt" to be confirmed. */
  const [excluding, setExcluding] = useState<string | null>(null);

  useEffect(() => {
    if (!live || paused) return;
    const timer = setInterval(() => setFiles((fs) => step(fs, 3, offline)), 900);
    return () => clearInterval(timer);
  }, [live, paused, offline]);

  return {
    files,
    offline,
    paused,
    setPaused,
    excluding,
    /** Excluding a folder the assistant has read anything from asks first. */
    askExclude: (prefix: string) =>
      countFiles(files, prefix).read > 0
        ? setExcluding(prefix)
        : setFiles((fs) => exclude(fs, prefix)),
    confirmExclude: () => {
      if (excluding !== null) setFiles((fs) => exclude(fs, excluding));
      setExcluding(null);
    },
    cancelExclude: () => setExcluding(null),
    include: (prefix: string) => setFiles((fs) => include(fs, prefix)),
    reread: (prefix: string) => setFiles((fs) => reread(fs, prefix)),
  };
}

type Reading = ReturnType<typeof useReading>;

// ---------------------------------------------------------------------------
// Small pieces

/** Read and understood, read but waiting for the machine, and the rest. */
function Bar({ counts, className }: { counts: Counts; className?: string }) {
  const pct = (n: number) => `${counts.total ? (100 * n) / counts.total : 0}%`;
  return (
    <div className={cn("bg-muted flex h-1.5 overflow-hidden rounded-full", className)}>
      <div
        className="bg-primary h-full"
        style={{ width: pct(counts.read - counts.pendingMeaning) }}
      />
      <div className="bg-warning h-full" style={{ width: pct(counts.pendingMeaning) }} />
    </div>
  );
}

/** An on/off switch: shadcn's Switch isn't exported, so a styled button. */
function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "bg-background size-4 rounded-full shadow transition-transform",
          on ? "translate-x-4.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/** "Read everything again" — long, so it asks first and says how long. */
function RereadEverything({ reading }: { reading: Reading }) {
  const total = countFiles(reading.files).total;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <RefreshCw /> Read everything again
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Read all {total} files again?</AlertDialogTitle>
          <AlertDialogDescription>
            This takes about {minutesFor(total)} minutes with this browser open. The assistant keeps
            answering from what it knows while it reads.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => reading.reread("")}>
            Read everything again
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Asks before a folder is excluded: what was learnt from it is forgotten. */
function ExcludeDialog({ reading }: { reading: Reading }) {
  const prefix = reading.excluding ?? "";
  const name = nameOf(prefix);
  const counts = countFiles(reading.files, prefix);
  return (
    <AlertDialog
      open={reading.excluding !== null}
      onOpenChange={(o) => !o && reading.cancelExclude()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop reading {name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="grid gap-2">
              <p>
                The assistant will forget what it learnt from {plural(counts.read, "file")} in{" "}
                {name}, and won't answer from them.
              </p>
              <p>
                The files stay in your folder, untouched. If you let the assistant read {name}{" "}
                again, it reads them from the start.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep reading</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90 text-white"
            onClick={reading.confirmExclude}
          >
            Stop reading {name}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const stateLabel: Record<IndexFile["state"], string> = {
  read: "Read",
  reading: "Being read",
  queued: "Waiting to be read",
  changed: "Changed — reading again",
  excluded: "Not read: its folder is off",
  failed: "Can't read",
};

// ---------------------------------------------------------------------------
// A — the settings page

/** The headline: how far the assistant got, how long is left, and pause. */
function Summary({ reading }: { reading: Reading }) {
  const c = countFiles(reading.files);
  const done = c.toGo === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base" aria-label="Summary">
          {done && c.failed === 0
            ? `The assistant has read all ${c.total} files`
            : `The assistant has read ${c.read} of ${c.total} files`}
        </CardTitle>
        <CardDescription>
          {reading.paused && !done
            ? `Reading paused · ${plural(c.toGo, "file")} to go`
            : done
              ? "Up to date. New and changed files are read as they appear."
              : `${plural(c.toGo, "file")} to go · about ${plural(minutesFor(c.toGo), "minute")} left`}
          {c.failed > 0 && ` · ${c.failed} can't be read`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Bar counts={c} />
        {reading.offline && (
          <div className="border-warning/50 bg-warning/10 flex gap-2 rounded-md border p-3 text-sm">
            <CloudOff className="mt-0.5 size-4 shrink-0" />
            <div className="grid gap-1">
              <p className="font-medium">The Sandclaw machine isn't answering</p>
              <p className="text-muted-foreground">
                Reading continues in this browser; understanding the meaning waits for the Sandclaw
                machine.{" "}
                {c.pendingMeaning > 0 &&
                  `${plural(c.pendingMeaning, "file")} read but not understood yet: answers can miss what's in them.`}
              </p>
            </div>
          </div>
        )}
        {c.pendingMeaning > 0 && (
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="bg-primary size-2 rounded-full" /> read and understood
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-warning size-2 rounded-full" /> read, waiting for the machine
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!done && (
            <Button size="sm" variant="outline" onClick={() => reading.setPaused(!reading.paused)}>
              {reading.paused ? <Play /> : <Pause />} {reading.paused ? "Resume" : "Pause reading"}
            </Button>
          )}
          <RereadEverything reading={reading} />
        </div>
      </CardContent>
    </Card>
  );
}

function Changed({ reading }: { reading: Reading }) {
  const changed = reading.files.filter((f) => f.state === "changed");
  if (changed.length === 0) return null;
  return (
    <section className="grid gap-1 rounded-md border p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <RefreshCw className="size-4 shrink-0" />
        {plural(changed.length, "file")} changed since{" "}
        {changed.length === 1 ? "it was" : "they were"} read — reading again
      </p>
      <ul className="text-muted-foreground grid gap-0.5 pl-6">
        {changed.map((f) => (
          <li key={f.path} className="truncate">
            {f.path}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground pl-6 text-xs">
        Until then, answers use what was in them before.
      </p>
    </section>
  );
}

function FolderRow({ reading, name }: { reading: Reading; name: string }) {
  const c = countFiles(reading.files, name);
  const on = c.total > 0;
  return (
    <li aria-label={name} className={cn("grid gap-2 py-3", !on && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Folder className="text-muted-foreground size-4 shrink-0" />
        <div className="min-w-0 flex-1 basis-40">
          <div className="truncate font-medium">{name}</div>
          <div className="text-muted-foreground text-xs">
            {on ? (
              <>
                {c.read} of {c.total} read
                {c.toGo > 0 && ` · ${c.toGo} waiting`}
                {c.failed > 0 && ` · ${c.failed} can't be read`}
              </>
            ) : (
              `${plural(c.excluded, "file")} · not read`
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {on && (
            <Button size="sm" variant="ghost" onClick={() => reading.reread(name)}>
              Read again
            </Button>
          )}
          <span className="text-muted-foreground">Read by the assistant</span>
          <Toggle
            on={on}
            label={`Read by the assistant: ${name}`}
            onChange={(v) => (v ? reading.include(name) : reading.askExclude(name))}
          />
        </div>
      </div>
      {on ? (
        <Bar counts={c} className="ml-7 h-1" />
      ) : (
        <p className="text-muted-foreground ml-7 flex items-center gap-1.5 text-xs">
          <EyeOff className="size-3.5 shrink-0" />
          The assistant won't see these files and won't answer from them.
        </p>
      )}
    </li>
  );
}

function CantRead({ reading }: { reading: Reading }) {
  const failed = reading.files.filter((f) => f.state === "failed");
  if (failed.length === 0) return null;
  return (
    <section className="grid gap-2">
      <h3 className="flex items-center gap-2 font-medium">
        <AlertTriangle className="text-warning size-4" /> {plural(failed.length, "file")} the
        assistant can't read
      </h3>
      <ul aria-label="Files the assistant can't read" className="divide-y rounded-md border">
        {failed.map((f) => {
          const reason = f.reason ? reasons[f.reason] : undefined;
          return (
            <li
              key={f.path}
              aria-label={nameOf(f.path)}
              className="flex flex-wrap items-start gap-2 p-3"
            >
              <div className="min-w-0 flex-1 basis-56">
                <div className="truncate text-sm font-medium">{nameOf(f.path)}</div>
                <div className="text-muted-foreground truncate text-xs">{f.path}</div>
                <div className="mt-1 text-sm">{reason?.title}</div>
                <div className="text-muted-foreground text-xs">{reason?.hint}</div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => reading.reread(f.path)}>
                  Try again
                </Button>
                {/* The prototype can't open files; the app hands them to the computer. */}
                <Button size="sm" variant="ghost">
                  Open file
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Find one file: where it stands, and read it again. */
function FindFile({ reading }: { reading: Reading }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const found = q ? reading.files.filter((f) => f.path.toLowerCase().includes(q)).slice(0, 5) : [];
  return (
    <section className="grid gap-2">
      <h3 className="font-medium">One file</h3>
      <div className="relative">
        <Search className="text-muted-foreground absolute top-2.5 left-2 size-3.5" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a file to see where it stands"
          aria-label="Find a file"
          className="h-8 pl-7 text-sm"
        />
      </div>
      {found.map((f) => (
        <div key={f.path} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{f.path}</span>
          <span className="text-muted-foreground text-xs">{stateLabel[f.state]}</span>
          {f.state !== "excluded" && (
            <Button size="sm" variant="ghost" onClick={() => reading.reread(f.path)}>
              Read again
            </Button>
          )}
        </div>
      ))}
      {q && found.length === 0 && (
        <p className="text-muted-foreground text-sm">No file matches “{query}”.</p>
      )}
    </section>
  );
}

function SettingsBody({ reading }: { reading: Reading }) {
  return (
    <div className="grid gap-5">
      <Summary reading={reading} />
      <Changed reading={reading} />
      <section className="grid gap-1">
        <h3 className="font-medium">Folders</h3>
        <p className="text-muted-foreground text-sm">
          Every folder is read unless you turn it off. Turned-off folders stay in your folder; the
          assistant just doesn't look at them.
        </p>
        <ul className="divide-y">
          {topFolders.map((name) => (
            <FolderRow key={name} reading={reading} name={name} />
          ))}
        </ul>
      </section>
      <CantRead reading={reading} />
      <FindFile reading={reading} />
    </div>
  );
}

/** A — one settings page: "What the assistant reads". */
export function IndexingPage(props: IndexingProps) {
  const reading = useReading(props);
  return (
    <div className="grid w-full max-w-2xl gap-4">
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold">What the assistant reads</h2>
        <p className="text-muted-foreground text-sm">
          The assistant reads the files in your folder, in this browser, so it can answer your
          questions and show where each answer comes from.
        </p>
      </div>
      <SettingsBody reading={reading} />
      <ExcludeDialog reading={reading} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// B — inside the folder zone tree

/** The mark on a folder row: how far, or why not. */
function FolderMark({ c }: { c: Counts }) {
  if (c.total === 0)
    return <EyeOff className="text-muted-foreground size-3.5 shrink-0" aria-label="Not read" />;
  return (
    <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1 text-xs">
      {c.failed > 0 && (
        <span
          className="text-warning flex items-center gap-0.5"
          title={`${c.failed} can't be read`}
        >
          <AlertTriangle className="size-3" />
          {c.failed}
        </span>
      )}
      {c.toGo > 0 ? (
        `${Math.floor((100 * c.read) / c.total)}%`
      ) : (
        <Check className="text-success size-3.5" aria-label="All read" />
      )}
    </span>
  );
}

function FileMark({ f }: { f: IndexFile }) {
  const cls = "ml-auto size-3.5 shrink-0";
  if (f.state === "reading")
    return <Loader2 className={cn(cls, "animate-spin")} aria-label="Being read" />;
  if (f.state === "changed")
    return <RefreshCw className={cls} aria-label="Changed — reading again" />;
  if (f.state === "failed")
    return <AlertTriangle className={cn(cls, "text-warning")} aria-label="Can't read" />;
  if (f.pendingMeaning)
    return <CloudOff className={cn(cls, "text-warning")} aria-label="Waiting for the machine" />;
  return null;
}

/** The row menu: what the user can do with this file or folder. */
function RowMenu({
  reading,
  path,
  isFolder,
}: {
  reading: Reading;
  path: string;
  isFolder: boolean;
}) {
  const c = countFiles(reading.files, path);
  const file = isFolder ? undefined : reading.files.find((f) => f.path === path);
  const item = "hover:bg-accent w-full rounded-sm px-2 py-1.5 text-left text-sm";
  return (
    <div
      role="menu"
      aria-label={`Actions for ${nameOf(path)}`}
      className="bg-popover mx-2 my-1 grid rounded-md border p-1 shadow-sm"
    >
      {file?.state === "failed" && file.reason && (
        <p className="text-muted-foreground px-2 py-1 text-xs">{reasons[file.reason].title}</p>
      )}
      {c.total > 0 && (
        <button type="button" role="menuitem" className={item} onClick={() => reading.reread(path)}>
          {file?.state === "failed"
            ? "Try again"
            : `Read this ${isFolder ? "folder" : "file"} again`}
        </button>
      )}
      {isFolder &&
        (c.total > 0 ? (
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => reading.askExclude(path)}
          >
            Don't let the assistant read this folder
          </button>
        ) : (
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => reading.include(path)}
          >
            Let the assistant read this folder
          </button>
        ))}
    </div>
  );
}

function TreeRows({
  reading,
  entries,
  depth,
  prefix,
  open,
  toggle,
  menu,
  setMenu,
}: {
  reading: Reading;
  entries: FolderEntry[];
  depth: number;
  prefix: string;
  open: Set<string>;
  toggle: (path: string) => void;
  menu: string | null;
  setMenu: (path: string | null) => void;
}) {
  return entries.map((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    const isFolder = entry.children !== undefined;
    const expanded = isFolder && open.has(path);
    const c = isFolder ? countFiles(reading.files, path) : undefined;
    const f = isFolder ? undefined : reading.files.find((x) => x.path === path);
    const dim = c ? c.total === 0 : f?.state === "queued" || f?.state === "excluded";
    const Icon = isFolder ? Folder : entry.name.endsWith(".jpg") ? FileImage : FileText;
    return (
      <div key={path}>
        <div className="group hover:bg-accent flex h-8 items-center rounded-md pr-1">
          <button
            type="button"
            onClick={() => isFolder && toggle(path)}
            // Right-click opens the same menu as the "…" button.
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(path);
            }}
            className={cn(
              "flex h-full min-w-0 flex-1 items-center gap-1.5 text-left text-sm",
              dim && "opacity-45",
            )}
            style={{ paddingLeft: 8 + depth * 14 }}
            title={f ? stateLabel[f.state] : undefined}
          >
            {isFolder ? (
              expanded ? (
                <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
              ) : (
                <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
              )
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <Icon className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate">{entry.name}</span>
            {c && <FolderMark c={c} />}
            {f && <FileMark f={f} />}
          </button>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 shrink-0 opacity-60 group-hover:opacity-100"
            aria-label={`More for ${entry.name}`}
            onClick={() => setMenu(menu === path ? null : path)}
          >
            <MoreHorizontal />
          </Button>
        </div>
        {menu === path && <RowMenu reading={reading} path={path} isFolder={isFolder} />}
        {expanded && entry.children && (
          <TreeRows
            reading={reading}
            entries={entry.children}
            depth={depth + 1}
            prefix={path}
            open={open}
            toggle={toggle}
            menu={menu}
            setMenu={setMenu}
          />
        )}
      </div>
    );
  });
}

/** The footer: the summary in one line, and "Details…" for the full page. */
function TreeFooter({ reading, details }: { reading: Reading; details: ReactNode }) {
  const c = countFiles(reading.files);
  const done = c.toGo === 0;
  return (
    <div className="grid gap-1.5 border-t px-3 py-2">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1">
          {done
            ? `Read all ${c.total} files`
            : `Getting to know your folder · ${c.read} of ${c.total} read`}
          {c.failed > 0 && ` · ${c.failed} can't be read`}
          {reading.paused && !done && " · paused"}
        </span>
        {details}
      </div>
      <Bar counts={c} className="h-1" />
      {reading.offline && (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <CloudOff className="mt-0.5 size-3 shrink-0" />
          Reading continues here; understanding waits for the Sandclaw machine.
        </p>
      )}
    </div>
  );
}

/** B — the folder zone's tree with marks, row actions and a summary footer. */
export function IndexingTree(props: IndexingProps) {
  const reading = useReading(props);
  const [open, setOpen] = useState(new Set(["Clients"]));
  const [menu, setMenu] = useState<string | null>(null);
  return (
    <div className="flex h-full flex-col">
      <ZoneTitle>Atelier docs</ZoneTitle>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1 pb-3">
          <TreeRows
            reading={reading}
            entries={atelierFolder}
            depth={0}
            prefix=""
            open={open}
            toggle={(path) => {
              const next = new Set(open);
              if (!next.delete(path)) next.add(path);
              setOpen(next);
            }}
            menu={menu}
            setMenu={setMenu}
          />
        </div>
      </ScrollArea>
      <TreeFooter
        reading={reading}
        details={
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="link" className="h-auto p-0 text-xs">
                Details…
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>What the assistant reads</DialogTitle>
                <DialogDescription>
                  The assistant reads the files in your folder, in this browser, so it can answer
                  your questions and show where each answer comes from.
                </DialogDescription>
              </DialogHeader>
              <SettingsBody reading={reading} />
            </DialogContent>
          </Dialog>
        }
      />
      <ExcludeDialog reading={reading} />
    </div>
  );
}
