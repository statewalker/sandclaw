import { MountUnavailable, type Problem } from "@statewalker/file-mounts.core";
import { Button, cn, Input } from "@statewalker/ui.view.shadcn";
import type { FileInfo, FilesApi } from "@statewalker/webrun-files";
import { dirname } from "@statewalker/webrun-files";
import {
  ArrowUp,
  ChevronRight,
  Cloud,
  FileText,
  Folder,
  FolderPlus,
  Globe,
  HardDrive,
  List,
  ListTree,
  Lock,
  type LucideIcon,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatBytes } from "../browser-data/storage.js";
import { BreadcrumbBar } from "./breadcrumb-bar.js";
import type { DemoMount } from "./demo-storages.js";
import { clickSelect, type Sort, type SortField, sortEntries } from "./paths.js";
import { type MenuItem, MenuList } from "./popup-menu.js";

/** Set on a drag between panels: a JSON array of paths. */
export const PATHS_TYPE = "application/x-sandclaw-paths";

export type PanelCommand =
  | "copy"
  | "move"
  | "mkdir"
  | "new-note"
  | "add-files"
  | "rename"
  | "delete"
  | "download"
  | "copy-path"
  | "open-in-new-panel";

/**
 * What a command acts on: `selected`, or for a command that creates something
 * (`CREATE_COMMANDS`), the folder `path` it creates in.
 */
export interface PanelHandle {
  path: string;
  selected: string[];
}

/** How a panel shows its folder: a sortable list, or a tree of its subfolders. */
export type PanelView = "list" | "tree";

export interface FilePanelProps {
  files: FilesApi;
  /** Names and per-mount problems. */
  mounts: DemoMount[];
  path: string;
  onNavigate(path: string): void;
  active?: boolean;
  onActivate?(): void;
  selected: string[];
  onSelect(selected: string[]): void;
  /** Bump to list the folder again. */
  refreshKey?: number;
  onOpenFile?(path: string): void;
  onCommand?(command: PanelCommand, panel: PanelHandle): void;
  /** A drag from another panel; Copy is preferred with Ctrl/Alt held or across storages. */
  onDropPaths?(paths: string[], targetDir: string, copyPreferred: boolean): void;
  /** Files dragged in from the desktop. */
  onDropExternal?(data: DataTransfer, targetDir: string): void;
  /** The action button of a mount's problem: Unlock / Reconnect / Retry. */
  onProblemAction?(mount: string, problem: Problem): void;
  /** Touch screens: no drag and drop; a "⋯" button per row opens its menu. */
  phone?: boolean;
  /** The view the panel opens in; the user switches it from the toolbar. Default: list. */
  initialView?: PanelView;
}

type Listing =
  | { status: "loading" }
  | { status: "ok"; entries: FileInfo[] }
  | { status: "problem"; mount: string; problem: Problem }
  | { status: "failed"; message: string };

const KEY_COMMANDS: Record<string, PanelCommand> = {
  F2: "rename",
  F5: "copy",
  F6: "move",
  F7: "mkdir",
  F8: "delete",
  Delete: "delete",
};

/** A storage (an entry of the root) can't be renamed, moved or deleted; these still apply to it. */
const ROOT_COMMANDS: PanelCommand[] = ["copy", "download", "copy-path", "open-in-new-panel"];

/** Commands that create something in a folder; the root, which only lists the storages, takes none. */
const CREATE_COMMANDS: PanelCommand[] = ["mkdir", "new-note", "add-files"];

const isStorage = (p: string) => p !== "/" && dirname(p) === "/";

/** Whether `command` applies to `target`: the same rule for the menu, the keys and the toolbar. */
function allowed(command: PanelCommand, target: PanelHandle): boolean {
  if (CREATE_COMMANDS.includes(command)) return target.path !== "/";
  return ROOT_COMMANDS.includes(command) || !target.selected.some(isStorage);
}

const MOUNT_ICONS: Record<DemoMount["type"], LucideIcon> = {
  "local-folder": HardDrive,
  opfs: Globe,
  s3: Cloud,
  memory: HardDrive,
};

const ACTION_LABEL: Partial<Record<Problem["cause"], string>> = {
  locked: "Unlock",
  "needs-access": "Reconnect",
};

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const COLUMNS: { field: SortField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "size", label: "Size" },
  { field: "lastModified", label: "Modified" },
];

// A narrow panel (a side bar) shows names only: the size and date columns need about 24rem.
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)] @sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem] items-center gap-2 px-2";
const DETAIL = "hidden @sm:block";

/** A row of either view; the list's rows are all at depth 0. */
interface Row {
  entry: FileInfo;
  depth: number;
}

/**
 * One panel of the file manager: breadcrumb, toolbar, the folder as a sortable
 * list or as a tree, keyboard, context menu and drag and drop. Both views share
 * the selection, the commands and their menu.
 */
export function FilePanel(props: FilePanelProps) {
  const { files, mounts, path, onNavigate, selected, onSelect, onCommand } = props;
  const [listing, setListing] = useState<Listing>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [sort, setSort] = useState<Sort>({ field: "name", descending: false });
  const [filter, setFilter] = useState("");
  const [cursor, setCursor] = useState<string>();
  const [dropTarget, setDropTarget] = useState<string>();
  // A menu for an entry, or (no entry) for the folder the panel shows.
  const [menu, setMenu] = useState<{ x: number; y: number; entry?: FileInfo }>();
  const [view, setView] = useState<PanelView>(props.initialView ?? "list");
  const tree = view === "tree";
  // Tree view: the open folders, and what each one holds once listed.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [children, setChildren] = useState<Record<string, FileInfo[]>>({});
  const anchor = useRef<string | undefined>(undefined);
  const filterBox = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const id = useId();

  const atRoot = path === "/";
  const mountNames = useMemo(
    () => Object.fromEntries(mounts.map((m) => [m.key, m.name])),
    [mounts],
  );

  // A new folder, or an explicit reload, starts from a clean slate: no stale
  // cursor or anchor (clickSelect misbehaves with an anchor that is not listed).
  useEffect(() => {
    anchor.current = undefined;
    setCursor(undefined);
  }, [path, reload, props.refreshKey]);

  useEffect(() => {
    setListing({ status: "loading" });
    setFilter("");
    setExpanded(new Set());
  }, [path]);

  // Open folders are listed again, like the panel's own folder, on a reload or a change.
  useEffect(() => setChildren({}), [path, reload, props.refreshKey]);

  useEffect(() => {
    let current = true;
    for (const dir of expanded) {
      if (children[dir]) continue;
      (async () => {
        const entries: FileInfo[] = [];
        try {
          for await (const e of files.list(dir)) entries.push(e);
        } catch {
          // An unreadable folder opens empty; the panel's own folder reports problems.
        }
        if (current) setChildren((c) => ({ ...c, [dir]: entries }));
      })();
    }
    return () => {
      current = false;
    };
  }, [files, expanded, children]);

  useEffect(() => {
    let current = true;
    if (atRoot) {
      const entries = mounts.map(
        (m): FileInfo => ({ kind: "directory", name: m.name, path: `/${m.key}` }),
      );
      setListing({ status: "ok", entries });
      return;
    }
    (async () => {
      try {
        const entries: FileInfo[] = [];
        for await (const e of files.list(path)) entries.push(e);
        if (current) setListing({ status: "ok", entries });
      } catch (e) {
        if (!current) return;
        if (e instanceof MountUnavailable) {
          setListing({ status: "problem", mount: e.mount, problem: e.problem });
        } else {
          setListing({ status: "failed", message: e instanceof Error ? e.message : String(e) });
        }
      }
    })();
    return () => {
      current = false;
    };
    // `reload` and `props.refreshKey` re-list the same folder.
  }, [files, mounts, path, atRoot, reload, props.refreshKey]);

  // The rows in screen order. In the tree an open folder is followed by its
  // contents; the filter keeps a folder whose shown contents match.
  const rows = useMemo(() => {
    if (listing.status !== "ok") return [];
    const needle = filter.trim().toLowerCase();
    const walk = (entries: FileInfo[], depth: number): Row[] =>
      sortEntries(entries, sort).flatMap((entry) => {
        const open = tree && entry.kind === "directory" && expanded.has(entry.path);
        const below = open ? walk(children[entry.path] ?? [], depth + 1) : [];
        const match = !needle || entry.name.toLowerCase().includes(needle);
        return match || below.length ? [{ entry, depth }, ...below] : [];
      });
    return walk(listing.entries, 0);
  }, [listing, filter, sort, tree, expanded, children]);
  const visible = useMemo(() => rows.map((r) => r.entry), [rows]);
  const order = useMemo(() => visible.map((e) => e.path), [visible]);
  // Commands act only on what is on screen: a row hidden by the filter is never deleted unseen.
  const shownSelection = selected.filter((p) => order.includes(p));

  const handle = (paths = shownSelection): PanelHandle => ({ path, selected: paths });
  const mountOf = (p: string) => p.split("/")[1] ?? "";
  const mountByKey = (key: string) => mounts.find((m) => m.key === key);

  const toggle = (dir: string, open?: boolean) =>
    setExpanded((x) => {
      const next = new Set(x);
      if (open ?? !x.has(dir)) next.add(dir);
      else next.delete(dir);
      return next;
    });

  // A folder opens in place in the tree, and becomes the panel's folder in the list.
  const open = (entry: FileInfo) => {
    if (entry.kind === "file") props.onOpenFile?.(entry.path);
    else if (tree) toggle(entry.path);
    else props.onNavigate(entry.path);
  };

  const pick = (entry: FileInfo, mods: { shift: boolean; ctrl: boolean }) => {
    // The filter or the sort may have dropped the anchor from the list.
    const from = anchor.current && order.includes(anchor.current) ? anchor.current : undefined;
    const next = clickSelect(selected, from, order, entry.path, mods);
    anchor.current = next.anchor;
    setCursor(entry.path);
    onSelect(next.selected);
  };

  const cursorTo = (to: number, extend = false) => {
    const target = visible[to];
    if (!target) return;
    pick(target, { shift: extend, ctrl: false });
    document.getElementById(`${id}-${to}`)?.scrollIntoView?.({ block: "nearest" });
  };

  const moveCursor = (delta: number, extend: boolean) => {
    if (!visible.length) return;
    const at = cursor ? order.indexOf(cursor) : -1;
    cursorTo(at < 0 ? 0 : Math.min(Math.max(at + delta, 0), visible.length - 1), extend);
  };

  // The tree's → and ←: open a folder, then go into it; close it, then go to its parent.
  const treeKey = (key: "ArrowRight" | "ArrowLeft") => {
    const at = cursor ? order.indexOf(cursor) : -1;
    const row = rows[at];
    if (!row) return;
    const { entry, depth } = row;
    const isOpen = entry.kind === "directory" && expanded.has(entry.path);
    if (key === "ArrowRight") {
      if (entry.kind !== "directory") return;
      if (!isOpen) toggle(entry.path, true);
      else if (rows[at + 1]?.depth === depth + 1) cursorTo(at + 1);
    } else if (isOpen) {
      toggle(entry.path, false);
    } else {
      const parent = rows.slice(0, at).findLastIndex((r) => r.depth === depth - 1);
      if (parent >= 0) cursorTo(parent);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const command = KEY_COMMANDS[e.key];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      moveCursor(e.key === "ArrowDown" ? 1 : -1, e.shiftKey);
    } else if (tree && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      treeKey(e.key);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      onSelect(order);
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      const at = cursor ? order.indexOf(cursor) : -1;
      const entry = visible[at];
      const row = document.getElementById(`${id}-${at}`)?.getBoundingClientRect();
      if (entry) setMenu({ x: row?.left ?? 0, y: row?.bottom ?? 0, entry });
    } else if (e.key === "Enter") {
      const entry = visible.find((v) => v.path === cursor);
      if (entry) open(entry);
    } else if (e.key === "Backspace") {
      if (!atRoot) onNavigate(dirname(path));
    } else if (command) {
      // With nothing selected a command acts on the cursor row, or on nothing;
      // a new folder needs no row.
      const atCursor = cursor && order.includes(cursor) ? [cursor] : [];
      const paths = shownSelection.length ? shownSelection : atCursor;
      const target = handle(paths);
      if (allowed(command, target) && (paths.length || CREATE_COMMANDS.includes(command))) {
        onCommand?.(command, target);
      }
    } else if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setFilter(e.key);
      filterBox.current?.focus();
    } else {
      return;
    }
    e.preventDefault();
  };

  const startDrag = (e: DragEvent, entry: FileInfo) => {
    const paths = selected.includes(entry.path) ? shownSelection : [entry.path];
    e.dataTransfer.setData(PATHS_TYPE, JSON.stringify(paths));
    e.dataTransfer.effectAllowed = "copyMove";
  };

  const acceptsDrop = (e: DragEvent) => {
    const types = Array.from(e.dataTransfer?.types ?? []);
    return types.includes(PATHS_TYPE) || types.includes("Files");
  };

  const dropProps = (target: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!acceptsDrop(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(target);
    },
    onDragLeave: () => setDropTarget((t) => (t === target ? undefined : t)),
    onDrop: (e: DragEvent) => {
      setDropTarget(undefined);
      // Anything else (a dock tab) belongs to the elements around the panel.
      if (!acceptsDrop(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const types = Array.from(e.dataTransfer.types ?? []);
      if (types.includes(PATHS_TYPE)) {
        const paths = JSON.parse(e.dataTransfer.getData(PATHS_TYPE)) as string[];
        // Across storages a drop copies: a move there would delete the original.
        const across = paths.some((p) => mountOf(p) !== mountOf(target));
        props.onDropPaths?.(paths, target, e.ctrlKey || e.altKey || across);
      } else if (types.includes("Files")) {
        props.onDropExternal?.(e.dataTransfer, target);
      }
    },
  });

  /** Opens a menu at the pointer, or under `anchor` (the ⋯ button, which a tap or a key may press). */
  const showMenu = (e: MouseEvent, entry?: FileInfo, anchor?: DOMRect) => {
    e.preventDefault();
    e.stopPropagation();
    if (entry && !selected.includes(entry.path)) pick(entry, { shift: false, ctrl: false });
    const at = anchor ? { x: anchor.left, y: anchor.bottom } : { x: e.clientX, y: e.clientY };
    setMenu({ ...at, entry });
  };

  /**
   * The one menu of both views. A folder's menu creates in that folder; the
   * menu of the empty area creates in the folder the panel shows.
   */
  const menuItems = (entry?: FileInfo): MenuItem[] => {
    const item = (c: PanelCommand, label: string, target: PanelHandle, hint?: string) =>
      allowed(c, target) ? [{ label, hint, onSelect: () => onCommand?.(c, target) }] : [];
    const creating = (dir: string) => {
      const into = { path: dir, selected: [] };
      return [
        ...item("new-note", "New note", into),
        ...item("mkdir", "New folder", into, "F7"),
        ...item("add-files", "Add files…", into),
      ];
    };
    if (!entry) return creating(path);
    const paths = selected.includes(entry.path) ? shownSelection : [entry.path];
    const target = handle(paths);
    const isFile = entry.kind === "file";
    return [
      { label: "Open", onSelect: () => open(entry) },
      ...(isFile ? [] : item("open-in-new-panel", "Open in new panel", target)),
      ...(isFile ? [] : creating(entry.path)),
      ...item("copy", "Copy to…", target, "F5"),
      ...item("move", "Move to…", target, "F6"),
      ...item("rename", "Rename", target, "F2"),
      ...item("delete", "Delete", target, "F8"),
      ...(isFile ? item("download", "Download", target) : []),
      ...item("copy-path", "Copy path", target),
    ];
  };

  const toggleSort = (field: SortField) =>
    setSort((s) => ({ field, descending: s.field === field && !s.descending }));

  const selectedBytes = visible.reduce(
    (sum, e) => (e.kind === "file" && selected.includes(e.path) ? sum + e.size : sum),
    0,
  );
  const count = visible.length;
  const status = [
    `${count} ${count === 1 ? "item" : "items"}`,
    ...(selected.length
      ? [`${selected.length} selected${selectedBytes ? ` · ${formatBytes(selectedBytes)}` : ""}`]
      : []),
  ].join(" · ");

  return (
    <section
      aria-label="Files"
      onMouseDown={props.onActivate}
      onFocus={props.onActivate}
      className={cn(
        "@container relative flex h-full min-h-0 min-w-0 flex-col rounded-md border bg-background",
        props.active && "ring-2 ring-primary/60",
      )}
    >
      <div className="flex items-center gap-1 border-b p-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Up"
          title="Up"
          disabled={atRoot}
          onClick={() => onNavigate(dirname(path))}
        >
          <ArrowUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh"
          title="Refresh"
          onClick={() => setReload((n) => n + 1)}
        >
          <RefreshCw className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New folder"
          title="New folder"
          disabled={atRoot}
          onClick={() => onCommand?.("mkdir", handle())}
        >
          <FolderPlus className="size-4" />
        </Button>
        <fieldset className="m-0 flex shrink-0 border-0 p-0" aria-label="View">
          <Button
            variant={tree ? "ghost" : "secondary"}
            size="icon-sm"
            aria-label="List view"
            title="List view"
            aria-pressed={!tree}
            onClick={() => setView("list")}
          >
            <List className="size-4" />
          </Button>
          <Button
            variant={tree ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Tree view"
            title="Tree view"
            aria-pressed={tree}
            onClick={() => setView("tree")}
          >
            <ListTree className="size-4" />
          </Button>
        </fieldset>
        <Input
          ref={filterBox}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            setFilter("");
            grid.current?.focus();
          }}
          placeholder="Filter by name"
          aria-label="Filter by name"
          className="ml-auto h-7 min-w-0 flex-1 basis-24"
        />
      </div>
      <div className="border-b px-1 py-0.5">
        <BreadcrumbBar
          files={files}
          path={path}
          mountNames={mountNames}
          onNavigate={onNavigate}
          onDropOn={(target, e) => dropProps(target).onDrop(e)}
        />
      </div>

      {listing.status === "problem" || listing.status === "failed" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <TriangleAlert className="size-6 text-destructive" aria-hidden="true" />
          <p className="text-sm">
            {listing.status === "problem"
              ? listing.problem.message
              : `This folder can't be read: ${listing.message}`}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              listing.status === "problem"
                ? props.onProblemAction?.(listing.mount, listing.problem)
                : setReload((n) => n + 1)
            }
          >
            {listing.status === "problem"
              ? (ACTION_LABEL[listing.problem.cause] ?? "Retry")
              : "Retry"}
          </Button>
        </div>
      ) : (
        // biome-ignore lint/a11y/noStaticElementInteractions: a grid or a treegrid (the view sets the role) with arrow-key navigation
        // biome-ignore lint/a11y/useAriaPropsSupportedByRole: grid and treegrid both support aria-multiselectable; the role is set by the view
        <div
          ref={grid}
          role={tree ? "treegrid" : "grid"}
          aria-label={`Contents of ${path}`}
          aria-multiselectable="true"
          aria-activedescendant={cursor ? `${id}-${order.indexOf(cursor)}` : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => (atRoot ? undefined : showMenu(e))}
          {...(atRoot ? {} : dropProps(path))}
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto outline-none focus-visible:ring-1 focus-visible:ring-ring",
            dropTarget === path && "bg-accent/50",
          )}
        >
          <div className={cn(ROW_GRID, "sticky top-0 z-10 border-b bg-muted py-1 text-xs")}>
            {COLUMNS.map(({ field, label }) => (
              // biome-ignore lint/a11y/useSemanticElements: a column header of an ARIA grid
              // biome-ignore lint/a11y/useFocusableInteractive: it only wraps the sort button
              <div
                key={field}
                role="columnheader"
                aria-sort={
                  sort.field === field ? (sort.descending ? "descending" : "ascending") : "none"
                }
                className={field === "name" ? "min-w-0" : cn(DETAIL, "min-w-0 text-right")}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(field)}
                  className="font-medium hover:underline"
                >
                  {label}
                  {sort.field === field ? (sort.descending ? " ↓" : " ↑") : ""}
                </button>
              </div>
            ))}
          </div>
          {rows.map(({ entry, depth }, i) => {
            const mount = isStorage(entry.path) ? mountByKey(mountOf(entry.path)) : undefined;
            const isOpen = tree && entry.kind === "directory" && expanded.has(entry.path);
            const Icon = mount
              ? mount.problem
                ? mount.problem.cause === "locked"
                  ? Lock
                  : TriangleAlert
                : MOUNT_ICONS[mount.type]
              : entry.kind === "directory"
                ? Folder
                : FileText;
            return (
              // biome-ignore lint/a11y/useSemanticElements: rows of an ARIA grid
              // biome-ignore lint/a11y/useFocusableInteractive: the grid owns focus (aria-activedescendant)
              // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled by the grid
              <div
                key={entry.path}
                id={`${id}-${i}`}
                role="row"
                aria-label={entry.name}
                aria-selected={selected.includes(entry.path)}
                aria-level={tree ? depth + 1 : undefined}
                aria-expanded={tree && entry.kind === "directory" ? isOpen : undefined}
                data-name={entry.name}
                draggable={!isStorage(entry.path) && !props.phone}
                onClick={(e) => pick(entry, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })}
                onDoubleClick={() => open(entry)}
                onContextMenu={(e) => showMenu(e, entry)}
                onDragStart={(e) => startDrag(e, entry)}
                {...(entry.kind === "directory" ? dropProps(entry.path) : {})}
                className={cn(
                  ROW_GRID,
                  "group/row cursor-default py-1 text-sm hover:bg-accent/40",
                  selected.includes(entry.path) && "bg-accent",
                  cursor === entry.path && "outline outline-1 -outline-offset-1 outline-ring",
                  dropTarget === entry.path && "bg-primary/20 ring-1 ring-primary ring-inset",
                )}
              >
                <span
                  className="flex min-w-0 items-center gap-2"
                  style={tree ? { paddingInlineStart: `${depth * 1}rem` } : undefined}
                >
                  {tree ? (
                    entry.kind === "directory" ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={isOpen ? `Close ${entry.name}` : `Open ${entry.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(entry.path);
                        }}
                        className="-mx-1 shrink-0 rounded-sm px-0.5 text-muted-foreground hover:bg-accent"
                      >
                        <ChevronRight
                          className={cn("size-3.5 transition-transform", isOpen && "rotate-90")}
                        />
                      </button>
                    ) : (
                      <span className="w-2.5 shrink-0" />
                    )
                  ) : null}
                  <Icon
                    className={cn("size-4 shrink-0", mount?.problem && "text-destructive")}
                    aria-hidden="true"
                  />
                  <span className="truncate">{entry.name}</span>
                  {/* The row's menu on a click: shown on hover and on the selected row, and
                      always on touch screens, where there is no right-click. */}
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Actions for ${entry.name}`}
                    title="Actions"
                    onClick={(e) => showMenu(e, entry, e.currentTarget.getBoundingClientRect())}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className={cn(
                      "ml-auto shrink-0 rounded-sm px-1.5 leading-none text-muted-foreground hover:bg-accent hover:text-foreground",
                      props.phone || selected.includes(entry.path) || menu?.entry === entry
                        ? "visible"
                        : "invisible group-hover/row:visible pointer-coarse:visible",
                    )}
                  >
                    ⋯
                  </button>
                </span>
                <span className={cn(DETAIL, "text-right text-xs text-muted-foreground")}>
                  {entry.kind === "file" ? formatBytes(entry.size) : ""}
                </span>
                <span className={cn(DETAIL, "truncate text-right text-xs text-muted-foreground")}>
                  {entry.kind === "file" ? dateFormat.format(entry.lastModified) : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t px-2 py-1 text-xs text-muted-foreground">
        {listing.status === "ok" ? status : " "}
      </div>

      {menu ? (
        <MenuList
          items={menuItems(menu.entry)}
          onClose={(refocus) => {
            setMenu(undefined);
            if (refocus) grid.current?.focus();
          }}
          className="fixed"
          // Kept on screen: on a phone the "⋯" sits at the right edge.
          style={{ left: Math.max(0, Math.min(menu.x, window.innerWidth - 176)), top: menu.y }}
        />
      ) : null}
    </section>
  );
}
