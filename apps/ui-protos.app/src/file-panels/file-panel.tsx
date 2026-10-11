import { Button, cn, Input } from "@statewalker/ui.view.shadcn";
import type { FileInfo, FilesApi } from "@statewalker/webrun-files";
import { dirname } from "@statewalker/webrun-files";
import {
  ArrowUp,
  Cloud,
  FileText,
  Folder,
  FolderPlus,
  Globe,
  HardDrive,
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
import { MountUnavailable, type Problem } from "./problem.js";

/** Set on a drag between panels: a JSON array of paths. */
export const PATHS_TYPE = "application/x-sandclaw-paths";

export type PanelCommand =
  | "copy"
  | "move"
  | "mkdir"
  | "rename"
  | "delete"
  | "download"
  | "copy-path"
  | "open-in-new-panel";

export interface PanelHandle {
  path: string;
  selected: string[];
}

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
  /** A drag from another panel. */
  onDropPaths?(paths: string[], targetDir: string, copyPreferred: boolean): void;
  /** Files dragged in from the desktop. */
  onDropExternal?(data: DataTransfer, targetDir: string): void;
  /** The action button of a mount's problem: Unlock / Reconnect / Retry. */
  onProblemAction?(mount: string, problem: Problem): void;
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

const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_4.5rem_6.5rem] items-center gap-2 px-2";

/** One panel of the file manager: breadcrumb, toolbar, sortable list, keyboard, context menu and drag and drop. */
export function FilePanel(props: FilePanelProps) {
  const { files, mounts, path, onNavigate, selected, onSelect, onCommand } = props;
  const [listing, setListing] = useState<Listing>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [sort, setSort] = useState<Sort>({ field: "name", descending: false });
  const [filter, setFilter] = useState("");
  const [cursor, setCursor] = useState<string>();
  const [dropTarget, setDropTarget] = useState<string>();
  const [menu, setMenu] = useState<{ x: number; y: number; entry: FileInfo }>();
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
  }, [path]);

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

  const visible = useMemo(() => {
    if (listing.status !== "ok") return [];
    const needle = filter.trim().toLowerCase();
    const shown = needle
      ? listing.entries.filter((e) => e.name.toLowerCase().includes(needle))
      : listing.entries;
    return sortEntries(shown, sort);
  }, [listing, filter, sort]);
  const order = useMemo(() => visible.map((e) => e.path), [visible]);

  const handle = (paths = selected): PanelHandle => ({ path, selected: paths });
  const mountOf = (p: string) => p.split("/")[1] ?? "";
  const mountByKey = (key: string) => mounts.find((m) => m.key === key);

  const open = (entry: FileInfo) => {
    if (entry.kind === "directory") props.onNavigate(entry.path);
    else props.onOpenFile?.(entry.path);
  };

  const pick = (entry: FileInfo, mods: { shift: boolean; ctrl: boolean }) => {
    // The filter or the sort may have dropped the anchor from the list.
    const from = anchor.current && order.includes(anchor.current) ? anchor.current : undefined;
    const next = clickSelect(selected, from, order, entry.path, mods);
    anchor.current = next.anchor;
    setCursor(entry.path);
    onSelect(next.selected);
  };

  const moveCursor = (delta: number, extend: boolean) => {
    if (!visible.length) return;
    const at = cursor ? order.indexOf(cursor) : -1;
    const to = at < 0 ? 0 : Math.min(Math.max(at + delta, 0), visible.length - 1);
    const target = visible[to] as FileInfo;
    pick(target, { shift: extend, ctrl: false });
    document.getElementById(`${id}-${to}`)?.scrollIntoView?.({ block: "nearest" });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const command = KEY_COMMANDS[e.key];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      moveCursor(e.key === "ArrowDown" ? 1 : -1, e.shiftKey);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      onSelect(order);
    } else if (e.key === "Enter") {
      const entry = visible.find((v) => v.path === cursor);
      if (entry) open(entry);
    } else if (e.key === "Backspace") {
      if (!atRoot) onNavigate(dirname(path));
    } else if (command) {
      // With nothing selected a command acts on the cursor row, or on nothing.
      const paths = selected.length ? selected : cursor ? [cursor] : [];
      if (paths.length) onCommand?.(command, handle(paths));
    } else if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setFilter(e.key);
      filterBox.current?.focus();
    } else {
      return;
    }
    e.preventDefault();
  };

  const startDrag = (e: DragEvent, entry: FileInfo) => {
    const paths = selected.includes(entry.path) ? selected : [entry.path];
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
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(undefined);
      const types = Array.from(e.dataTransfer.types ?? []);
      if (types.includes(PATHS_TYPE)) {
        const paths = JSON.parse(e.dataTransfer.getData(PATHS_TYPE)) as string[];
        props.onDropPaths?.(paths, target, e.ctrlKey || e.altKey);
      } else if (types.includes("Files")) {
        props.onDropExternal?.(e.dataTransfer, target);
      }
    },
  });

  const showMenu = (e: MouseEvent, entry: FileInfo) => {
    e.preventDefault();
    if (!selected.includes(entry.path)) pick(entry, { shift: false, ctrl: false });
    setMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const menuItems = (entry: FileInfo): MenuItem[] => {
    const paths = selected.includes(entry.path) ? selected : [entry.path];
    const run = (c: PanelCommand) => () => onCommand?.(c, handle(paths));
    const isFile = entry.kind === "file";
    return [
      { label: "Open", onSelect: () => open(entry) },
      ...(isFile ? [] : [{ label: "Open in new panel", onSelect: run("open-in-new-panel") }]),
      { label: "Copy to…", hint: "F5", onSelect: run("copy") },
      { label: "Move to…", hint: "F6", onSelect: run("move") },
      { label: "Rename", hint: "F2", onSelect: run("rename") },
      { label: "Delete", hint: "F8", onSelect: run("delete") },
      ...(isFile ? [{ label: "Download", onSelect: run("download") }] : []),
      { label: "Copy path", onSelect: run("copy-path") },
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
        "relative flex h-full min-h-0 min-w-0 flex-col rounded-md border bg-background",
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
          onClick={() => onCommand?.("mkdir", handle())}
        >
          <FolderPlus className="size-4" />
        </Button>
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
        // biome-ignore lint/a11y/useSemanticElements: a grid of rows with arrow-key navigation
        <div
          ref={grid}
          role="grid"
          aria-label={`Contents of ${path}`}
          aria-multiselectable="true"
          aria-activedescendant={cursor ? `${id}-${order.indexOf(cursor)}` : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
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
                className={field === "name" ? "min-w-0" : "min-w-0 text-right"}
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
          {visible.map((entry, i) => {
            const mount = atRoot ? mountByKey(mountOf(entry.path)) : undefined;
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
                data-name={entry.name}
                draggable={!atRoot}
                onClick={(e) => pick(entry, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })}
                onDoubleClick={() => open(entry)}
                onContextMenu={(e) => showMenu(e, entry)}
                onDragStart={(e) => startDrag(e, entry)}
                {...(entry.kind === "directory" ? dropProps(entry.path) : {})}
                className={cn(
                  ROW_GRID,
                  "cursor-default py-1 text-sm hover:bg-accent/40",
                  selected.includes(entry.path) && "bg-accent",
                  cursor === entry.path && "outline outline-1 -outline-offset-1 outline-ring",
                  dropTarget === entry.path && "bg-primary/20 ring-1 ring-primary ring-inset",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon
                    className={cn("size-4 shrink-0", mount?.problem && "text-destructive")}
                    aria-hidden="true"
                  />
                  <span className="truncate">{entry.name}</span>
                </span>
                <span className="text-right text-xs text-muted-foreground">
                  {entry.kind === "file" ? formatBytes(entry.size) : ""}
                </span>
                <span className="truncate text-right text-xs text-muted-foreground">
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
          style={{ left: menu.x, top: menu.y }}
        />
      ) : null}
    </section>
  );
}
