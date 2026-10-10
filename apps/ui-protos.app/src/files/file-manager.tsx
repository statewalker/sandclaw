import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@statewalker/ui.view.shadcn";
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FilePlus,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  type LucideIcon,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { type FolderEntry, folder } from "../mock.js";
import { ZoneTitle } from "../zone-title.js";
import {
  countFiles,
  create,
  findEntry,
  importFiles,
  isOutput,
  joinPath,
  listFolders,
  move,
  moveError,
  nameError,
  nameOf,
  OUTPUTS,
  parentOf,
  remove,
  rename,
  VIEWER_LABEL,
  type Viewer,
  viewerFor,
} from "./file-ops.js";

/** Set on a drag from the tree: the chat composer takes it as a reference. */
export const FOLDER_PATH_TYPE = "application/x-sandclaw-path";

/**
 * - `menu`: each row has a "…" menu (also on right-click and Shift+F10), and
 *   renames in place; one entry at a time.
 * - `toolbar`: a toolbar above the tree acts on the selection, which can hold
 *   several entries (Ctrl/⌘-click, Space).
 */
export type FileManagerVariant = "menu" | "toolbar";

/**
 * - `trash`: deleted entries go to Sandclaw's trash inside the folder, and can
 *   be restored;
 * - `permanent`: deleted from the disk, as the browser's file access does.
 */
export type DeleteMode = "trash" | "permanent";

export interface FileManagerProps {
  variant?: FileManagerVariant;
  deleteMode?: DeleteMode;
  tree?: FolderEntry[];
  /** A touch screen: no drag and drop, "…" always visible, "Move to…" instead. */
  touch?: boolean;
  /** Show the keyboard shortcuts under the tree. */
  keyHints?: boolean;
  /** Where a story starts. */
  selected?: string[];
  renaming?: { path: string; draft: string };
  confirmDelete?: boolean;
  dragging?: { path: string; over: string };
  imported?: { folder: string; names: string[] };
  /** "Show in folder" from elsewhere (a chat chip, a viewer): open, select, scroll to it. */
  reveal?: string;
  onOpen?: (path: string, viewer: Viewer) => void;
}

interface Row {
  path: string;
  entry: FolderEntry;
  depth: number;
}

interface Status {
  text: string;
  undo?: FolderEntry[];
}

const where = (folder: string) => (folder ? `“${nameOf(folder)}”` : "your folder");
const ancestors = (path: string) =>
  path
    .split("/")
    .slice(0, -1)
    .map((_, i, parts) => parts.slice(0, i + 1).join("/"));
/** Entries inside another selected folder go with it. */
const topmost = (paths: string[]) =>
  paths.filter((p) => !paths.some((q) => q !== p && p.startsWith(`${q}/`)));

function visibleRows(entries: FolderEntry[], closed: Set<string>, prefix = "", depth = 0): Row[] {
  return entries.flatMap((entry) => {
    const path = joinPath(prefix, entry.name);
    const row = { path, entry, depth };
    return entry.children && !closed.has(path)
      ? [row, ...visibleRows(entry.children, closed, path, depth + 1)]
      : [row];
  });
}

function EntryIcon({ path, entry }: { path: string; entry: FolderEntry }) {
  const Icon =
    path === OUTPUTS
      ? Sparkles
      : entry.children
        ? Folder
        : /\.(xlsx|xls|csv|ods)$/i.test(entry.name)
          ? FileSpreadsheet
          : FileText;
  return (
    <Icon
      className={cn(
        "size-4 shrink-0",
        path === OUTPUTS ? "text-violet-500" : "text-muted-foreground",
      )}
    />
  );
}

interface MenuItem {
  label: string;
  icon: LucideIcon;
  run: () => void;
  destructive?: boolean;
}

/** A menu of actions, placed under its anchor; arrows move, Escape closes. */
function ActionMenu({
  label,
  items,
  anchor,
  onClose,
}: {
  label: string;
  items: MenuItem[];
  anchor: DOMRect;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, []);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [onClose]);

  const onKeyDown = (e: KeyboardEvent) => {
    const all = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    const go = (j: number) => all[(j + all.length) % all.length]?.focus();
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(-1);
    else if (e.key === "Escape" || e.key === "Tab") onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  // Opens below the anchor, or above it near the bottom of the screen.
  const below = anchor.bottom + items.length * 36 + 16 < window.innerHeight;
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="bg-popover text-popover-foreground fixed z-50 grid min-w-44 rounded-md border p-1 shadow-md"
      style={{
        right: Math.max(8, window.innerWidth - anchor.right),
        ...(below
          ? { top: anchor.bottom + 4 }
          : { bottom: Math.max(8, window.innerHeight - anchor.top + 4) }),
      }}
    >
      {items.map(({ label, icon: Icon, run, destructive }) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => {
            onClose();
            run();
          }}
          className={cn(
            "hover:bg-accent focus:bg-accent flex h-8 items-center gap-2 rounded-sm px-2 text-left text-sm outline-none",
            destructive && "text-destructive",
          )}
        >
          <Icon className="size-4" /> {label}
        </button>
      ))}
    </div>
  );
}

export function FileManager({
  variant = "menu",
  deleteMode = "trash",
  tree: initialTree = folder,
  touch = false,
  keyHints = false,
  selected: initialSelected = [],
  renaming: initialRenaming,
  confirmDelete = false,
  dragging,
  imported,
  reveal,
  onOpen,
}: FileManagerProps) {
  const [first] = useState(() => {
    if (!imported) return { tree: initialTree, selected: initialSelected, status: undefined };
    const r = importFiles(initialTree, imported.folder, imported.names);
    const n = r.paths.length;
    const clashes = r.renamed.map(
      ([from, to]) => ` “${from}” was already there, so the new one is “${to}”.`,
    );
    return {
      tree: r.tree,
      selected: r.paths,
      status: {
        text: `Added ${n === 1 ? `“${nameOf(r.paths[0] ?? "")}”` : `${n} files`} to ${where(imported.folder)}.${clashes.join("")}`,
      },
    };
  });
  const [tree, setTree] = useState(first.tree);
  const [selected, setSelected] = useState<string[]>(reveal ? [reveal] : first.selected);
  const [focusPath, setFocusPath] = useState(selected[0] ?? "");
  const [closed, setClosed] = useState(() => {
    const shown = [...selected, initialRenaming?.path ?? "", dragging?.over ?? ""];
    const keepOpen = shown.flatMap((p) => [...ancestors(p), p]);
    return new Set(["Finance/invoices", "Clients/contracts"].filter((p) => !keepOpen.includes(p)));
  });
  const [renaming, setRenaming] = useState(initialRenaming);
  const [confirm, setConfirm] = useState<string[] | null>(confirmDelete ? selected : null);
  const [moving, setMoving] = useState<string[] | null>(null);
  const [menu, setMenu] = useState<{ path: string; anchor: DOMRect } | null>(null);
  const [drag, setDrag] = useState<{ paths: string[]; over: string | null } | null>(
    dragging ? { paths: [dragging.path], over: dragging.over } : null,
  );
  const [external, setExternal] = useState<{ over: string; count: number } | null>(null);
  const [status, setStatus] = useState<Status | undefined>(
    first.status ??
      (reveal ? { text: `Showing “${nameOf(reveal)}” in ${where(parentOf(reveal))}.` } : undefined),
  );

  const rowRefs = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importTarget = useRef("");

  useEffect(() => {
    // The rename field keeps the focus it took.
    if (pendingFocus.current === null || renaming) return;
    rowRefs.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });
  useEffect(() => {
    if (reveal) rowRefs.current.get(reveal)?.scrollIntoView?.({ block: "nearest" });
  }, [reveal]);

  const rows = visibleRows(tree, closed);
  const tabStop = rows.some((r) => r.path === focusPath) ? focusPath : (rows[0]?.path ?? "");
  const multi = variant === "toolbar";

  const focusRow = (path: string) => {
    setFocusPath(path);
    pendingFocus.current = path;
  };
  const setOpen = (path: string, open: boolean) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (open) next.delete(path);
      else next.add(path);
      return next;
    });
  /** The folder new entries and imports go to: the selected folder, or the selected file's. */
  const targetFolder = () => {
    const path = selected.length === 1 ? (selected[0] ?? "") : "";
    return path && findEntry(tree, path)?.children ? path : parentOf(path);
  };
  const isProtected = (path: string) => path === OUTPUTS;
  const protectedNotice = () =>
    setStatus({ text: "The assistant saves its work in Outputs, so it stays where it is." });

  const open = (path: string) => {
    const viewer = viewerFor(nameOf(path));
    onOpen?.(path, viewer);
    setStatus({
      text:
        viewer === "none"
          ? `No viewer for “${nameOf(path)}” here. Download it to open it on your computer.`
          : `Opening “${nameOf(path)}” in ${VIEWER_LABEL[viewer]}.`,
    });
  };

  const startRename = (path: string) => {
    if (isProtected(path)) return protectedNotice();
    setRenaming({ path, draft: nameOf(path) });
  };
  const renameError = renaming
    ? renaming.draft === nameOf(renaming.path)
      ? undefined
      : nameError(tree, parentOf(renaming.path), renaming.draft, nameOf(renaming.path))
    : undefined;
  const commitRename = () => {
    if (!renaming) return;
    const r = rename(tree, renaming.path, renaming.draft);
    setRenaming(undefined);
    if ("error" in r) return focusRow(renaming.path);
    setTree(r.tree);
    setSelected([r.path]);
    focusRow(r.path);
  };

  const newEntry = (kind: "file" | "folder", folderPath = targetFolder()) => {
    const r = create(tree, folderPath, kind);
    if ("error" in r) return;
    setTree(r.tree);
    if (folderPath) setOpen(folderPath, true);
    setSelected([r.path]);
    setFocusPath(r.path);
    setRenaming({ path: r.path, draft: nameOf(r.path) });
  };

  const askDelete = (paths: string[]) => {
    if (paths.some(isProtected)) return protectedNotice();
    if (paths.length) setConfirm(topmost(paths));
  };
  const doDelete = (paths: string[]) => {
    const before = tree;
    setTree(paths.reduce(remove, tree));
    setSelected([]);
    const what = paths.length === 1 ? `“${nameOf(paths[0] ?? "")}”` : `${paths.length} items`;
    setStatus(
      deleteMode === "trash"
        ? { text: `Moved ${what} to the trash.`, undo: before }
        : { text: `Deleted ${what} from your computer.` },
    );
  };

  const doMove = (paths: string[], to: string) => {
    let next = tree;
    const moved: string[] = [];
    for (const path of topmost(paths)) {
      const r = move(next, path, to);
      if ("error" in r) return setStatus({ text: `Couldn’t move “${nameOf(path)}”: ${r.error}` });
      next = r.tree;
      moved.push(r.path);
    }
    setTree(next);
    if (to) setOpen(to, true);
    setSelected(moved);
    const what = moved.length === 1 ? `“${nameOf(moved[0] ?? "")}”` : `${moved.length} items`;
    setStatus({ text: `Moved ${what} to ${where(to)}.` });
  };

  const doImport = (to: string, names: string[]) => {
    if (!names.length) return;
    const r = importFiles(tree, to, names);
    setTree(r.tree);
    if (to) setOpen(to, true);
    setSelected(r.paths);
    const clashes = r.renamed.map(
      ([from, as]) => ` “${from}” was already there, so the new one is “${as}”.`,
    );
    const what = r.paths.length === 1 ? `“${nameOf(r.paths[0] ?? "")}”` : `${r.paths.length} files`;
    setStatus({ text: `Added ${what} to ${where(to)}.${clashes.join("")}` });
  };
  const pickFiles = (to: string) => {
    importTarget.current = to;
    fileInput.current?.click();
  };

  const download = (paths: string[]) =>
    setStatus({
      text: `Downloading ${paths.length === 1 ? `“${nameOf(paths[0] ?? "")}”` : `${paths.length} files`}…`,
    });

  // --- Mouse and keyboard on rows ---

  const activate = (path: string, e: MouseEvent) => {
    const isFolder = !!findEntry(tree, path)?.children;
    setFocusPath(path);
    if (multi && (e.ctrlKey || e.metaKey)) {
      return setSelected((s) => (s.includes(path) ? s.filter((p) => p !== path) : [...s, path]));
    }
    setSelected([path]);
    if (isFolder) setOpen(path, closed.has(path));
    else open(path);
  };

  const openMenu = (path: string, anchor: HTMLElement) => {
    setSelected([path]);
    setFocusPath(path);
    setMenu({ path, anchor: anchor.getBoundingClientRect() });
  };

  const onRowKey = (e: KeyboardEvent<HTMLElement>, row: Row) => {
    if (e.target !== e.currentTarget) return;
    const i = rows.findIndex((r) => r.path === row.path);
    const isFolder = !!row.entry.children;
    const step = (j: number) => {
      const to = rows[j];
      if (!to) return;
      focusRow(to.path);
      if (!multi) setSelected([to.path]);
    };
    const current = multi && selected.includes(row.path) ? selected : [row.path];
    switch (e.key) {
      case "ArrowDown":
        step(i + 1);
        break;
      case "ArrowUp":
        step(i - 1);
        break;
      case "Home":
        step(0);
        break;
      case "End":
        step(rows.length - 1);
        break;
      case "ArrowRight":
        if (isFolder && closed.has(row.path)) setOpen(row.path, true);
        else if (isFolder) step(i + 1);
        break;
      case "ArrowLeft":
        if (isFolder && !closed.has(row.path)) setOpen(row.path, false);
        else if (row.depth > 0) step(rows.findIndex((r) => r.path === parentOf(row.path)));
        break;
      case "Enter":
        setSelected([row.path]);
        if (isFolder) setOpen(row.path, closed.has(row.path));
        else open(row.path);
        break;
      case " ":
        if (!multi) return;
        setSelected((s) =>
          s.includes(row.path) ? s.filter((p) => p !== row.path) : [...s, row.path],
        );
        break;
      case "F2":
        startRename(row.path);
        break;
      case "Delete":
        askDelete(current);
        break;
      case "ContextMenu":
        if (variant === "menu") openMenu(row.path, e.currentTarget);
        break;
      default:
        if (e.key === "F10" && e.shiftKey && variant === "menu") {
          openMenu(row.path, e.currentTarget);
          break;
        }
        return;
    }
    e.preventDefault();
  };

  // --- Drag and drop: moves inside the tree, imports from the computer ---

  const dropFolder = (row: Row | undefined) =>
    row ? (row.entry.children ? row.path : parentOf(row.path)) : "";

  const onDragStart = (e: DragEvent, path: string) => {
    const paths = selected.includes(path) ? selected : [path];
    e.dataTransfer.setData(FOLDER_PATH_TYPE, path);
    e.dataTransfer.setData("text/plain", path);
    e.dataTransfer.effectAllowed = "copyMove";
    setDrag({ paths, over: null });
  };
  const onDragOver = (e: DragEvent, row: Row | undefined) => {
    const to = dropFolder(row);
    if (drag) {
      if (drag.paths.some((p) => moveError(tree, p, to))) {
        if (drag.over !== null) setDrag({ ...drag, over: null });
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (drag.over !== to) setDrag({ ...drag, over: to });
    } else if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      if (external?.over !== to) setExternal({ over: to, count: e.dataTransfer.items.length });
    }
  };
  const onDrop = (e: DragEvent, row: Row | undefined) => {
    e.preventDefault();
    e.stopPropagation();
    const to = dropFolder(row);
    if (drag) doMove(drag.paths, to);
    else
      doImport(
        to,
        [...e.dataTransfer.files].map((f) => f.name),
      );
    setDrag(null);
    setExternal(null);
  };
  const dropOver = drag?.over ?? external?.over ?? null;

  // --- Actions offered for an entry ---

  const actionsFor = (path: string): MenuItem[] => {
    const entry = findEntry(tree, path);
    const isFolder = !!entry?.children;
    const items: MenuItem[] = isFolder
      ? [
          { label: "New note", icon: FilePlus, run: () => newEntry("file", path) },
          { label: "New folder", icon: FolderPlus, run: () => newEntry("folder", path) },
          { label: "Add files…", icon: Upload, run: () => pickFiles(path) },
        ]
      : [
          { label: "Open", icon: ExternalLink, run: () => open(path) },
          { label: "Download", icon: Download, run: () => download([path]) },
        ];
    if (isProtected(path)) return items;
    return [
      ...items,
      { label: "Rename", icon: Pencil, run: () => startRename(path) },
      { label: "Move to…", icon: FolderInput, run: () => setMoving([path]) },
      { label: "Delete…", icon: Trash2, run: () => askDelete([path]), destructive: true },
    ];
  };
  const rootActions: MenuItem[] = [
    { label: "New note", icon: FilePlus, run: () => newEntry("file", "") },
    { label: "New folder", icon: FolderPlus, run: () => newEntry("folder", "") },
    { label: "Add files…", icon: Upload, run: () => pickFiles("") },
  ];

  // --- The delete confirmation's words ---

  const confirmEntries = (confirm ?? []).map((p) => ({ path: p, entry: findEntry(tree, p) }));
  const confirmFiles = confirmEntries.reduce((n, c) => n + (c.entry ? countFiles(c.entry) : 0), 0);
  const single = confirmEntries.length === 1 ? confirmEntries[0] : undefined;
  const confirmTitle = single
    ? `Delete ${single.entry?.children ? "the folder " : ""}“${nameOf(single.path)}”?`
    : `Delete ${confirmEntries.length} items?`;
  const filesPhrase = `${confirmFiles} file${confirmFiles === 1 ? "" : "s"}`;
  const subject = single
    ? single.entry?.children
      ? confirmFiles
        ? `The folder and the ${filesPhrase} in it`
        : "The empty folder"
      : "The file"
    : `These ${confirmEntries.length} items (${filesPhrase} in all)`;
  const confirmText =
    deleteMode === "trash"
      ? `${subject} will go to Sandclaw’s trash. You can restore them from there for 30 days.`
      : `${subject} will be deleted from your computer. They don’t go to your computer’s Trash, and this can’t be undone.`;
  const confirmAction =
    deleteMode === "trash"
      ? "Move to trash"
      : single && !single.entry?.children
        ? "Delete file"
        : `Delete ${filesPhrase}`;

  // --- The toolbar (variant B) ---

  const selectedEntries = selected.map((p) => findEntry(tree, p));
  const allFiles = selected.length > 0 && selectedEntries.every((e) => e && !e.children);
  const tools: (MenuItem & { disabled?: boolean })[] = [
    { label: "New note", icon: FilePlus, run: () => newEntry("file") },
    { label: "New folder", icon: FolderPlus, run: () => newEntry("folder") },
    { label: "Add files…", icon: Upload, run: () => pickFiles(targetFolder()) },
    {
      label: "Rename",
      icon: Pencil,
      run: () => startRename(selected[0] ?? ""),
      disabled: selected.length !== 1 || selected.some(isProtected),
    },
    {
      label: "Move to…",
      icon: FolderInput,
      run: () => setMoving(selected),
      disabled: !selected.length || selected.some(isProtected),
    },
    { label: "Download", icon: Download, run: () => download(selected), disabled: !allFiles },
    {
      label: "Delete…",
      icon: Trash2,
      run: () => askDelete(selected),
      disabled: !selected.length || selected.some(isProtected),
      destructive: true,
    },
  ];
  const onToolbarKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    all[(i + (e.key === "ArrowRight" ? 1 : -1) + all.length) % all.length]?.focus();
    e.preventDefault();
  };

  // --- The hint over a drop ---

  const dropHint =
    drag?.over != null
      ? `Move ${drag.paths.length === 1 ? `“${nameOf(drag.paths[0] ?? "")}”` : `${drag.paths.length} items`} to ${where(drag.over)}`
      : external
        ? `Add ${external.count === 1 ? "1 file" : `${external.count} files`} to ${where(external.over)}`
        : undefined;

  return (
    <div className="bg-background flex h-[560px] w-full max-w-sm flex-col overflow-hidden rounded-lg border">
      <ZoneTitle
        action={
          variant === "menu" ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Actions for your folder"
              aria-haspopup="menu"
              onClick={(e) =>
                setMenu({ path: "", anchor: e.currentTarget.getBoundingClientRect() })
              }
            >
              <MoreHorizontal />
            </Button>
          ) : selected.length > 1 ? (
            <span className="text-muted-foreground text-xs">{selected.length} selected</span>
          ) : undefined
        }
      >
        Atelier docs
      </ZoneTitle>

      {variant === "toolbar" && (
        <div
          role="toolbar"
          aria-label="File actions"
          onKeyDown={onToolbarKey}
          className="flex flex-wrap items-center gap-0.5 border-b px-2 pb-1.5"
        >
          {tools.map(({ label, icon: Icon, run, disabled, destructive }, i) => (
            <Button
              key={label}
              size="icon"
              variant="ghost"
              className={cn("size-8", i === 3 && "ml-2", destructive && "text-destructive")}
              aria-label={label}
              title={label}
              disabled={disabled}
              onClick={run}
            >
              <Icon />
            </Button>
          ))}
        </div>
      )}

      <div
        role="tree"
        aria-label="Atelier docs"
        aria-multiselectable={multi || undefined}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-1 py-1",
          dropOver === "" && "bg-primary/5 ring-primary/40 ring-2 ring-inset",
        )}
        onDragOver={(e) => onDragOver(e, undefined)}
        onDrop={(e) => onDrop(e, undefined)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setExternal(null);
            if (drag) setDrag({ ...drag, over: null });
          }
        }}
      >
        {rows.map((row) => {
          const { path, entry, depth } = row;
          const isFolder = !!entry.children;
          const expanded = isFolder && !closed.has(path);
          const isSelected = selected.includes(path);
          const isRenaming = renaming?.path === path;
          const isTarget = dropOver === path;
          const Chevron = expanded ? ChevronDown : ChevronRight;
          return (
            <div
              key={path}
              ref={(el) => {
                if (el) rowRefs.current.set(path, el);
                else rowRefs.current.delete(path);
              }}
              role="treeitem"
              aria-label={entry.name}
              aria-level={depth + 1}
              aria-selected={isSelected}
              aria-expanded={isFolder ? expanded : undefined}
              tabIndex={path === tabStop ? 0 : -1}
              draggable={!touch && !isRenaming && !isProtected(path)}
              onDragStart={(e) => onDragStart(e, path)}
              onDragEnd={() => setDrag(null)}
              onDragOver={(e) => onDragOver(e, row)}
              onDrop={(e) => onDrop(e, row)}
              onClick={(e) => activate(path, e)}
              onKeyDown={(e) => onRowKey(e, row)}
              onContextMenu={
                variant === "menu"
                  ? (e) => {
                      e.preventDefault();
                      openMenu(path, e.currentTarget);
                    }
                  : undefined
              }
              className={cn(
                "group hover:bg-accent focus-visible:ring-ring flex min-w-0 cursor-default items-center gap-1.5 rounded-md pr-1 text-sm outline-none focus-visible:ring-2",
                touch ? "min-h-10" : "min-h-8",
                isSelected && "bg-accent",
                drag?.paths.includes(path) && "opacity-50",
                isTarget && "bg-primary/10 ring-primary ring-2 ring-inset",
              )}
              style={{ paddingLeft: 6 + depth * 14 }}
            >
              {isFolder ? (
                <Chevron className="text-muted-foreground size-3.5 shrink-0" />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <EntryIcon path={path} entry={entry} />
              {isRenaming ? (
                <RenameInput
                  draft={renaming.draft}
                  error={renameError}
                  onChange={(draft) => setRenaming({ path, draft })}
                  onCommit={commitRename}
                  onCancel={() => {
                    setRenaming(undefined);
                    focusRow(path);
                  }}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate py-1">
                  {entry.name}
                  {path === OUTPUTS && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      Made by the assistant
                    </span>
                  )}
                </span>
              )}
              {!isFolder && isOutput(path) && !isRenaming && (
                <span title="Made by the assistant" className="shrink-0">
                  <Sparkles
                    className="size-3.5 text-violet-500"
                    aria-label="Made by the assistant"
                  />
                </span>
              )}
              {variant === "menu" && !isRenaming && (
                <Button
                  size="icon"
                  variant="ghost"
                  tabIndex={-1}
                  aria-label={`Actions for ${entry.name}`}
                  aria-haspopup="menu"
                  className={cn(
                    "size-7 shrink-0",
                    !touch && "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                    (touch || isSelected) && "opacity-100",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    openMenu(path, e.currentTarget);
                  }}
                >
                  <MoreHorizontal />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {(dropHint || status || keyHints || touch) && (
        <div className="grid gap-1 border-t px-3 py-2 text-xs">
          {dropHint ? (
            <p className="text-primary font-medium">{dropHint}</p>
          ) : (
            status && (
              <p
                role="status"
                className="text-muted-foreground flex flex-wrap items-center gap-x-2"
              >
                <span>{status.text}</span>
                {status.undo && (
                  <button
                    type="button"
                    className="text-foreground font-medium underline underline-offset-2"
                    onClick={() => {
                      if (status.undo) setTree(status.undo);
                      setStatus({ text: "Restored." });
                    }}
                  >
                    Undo
                  </button>
                )}
              </p>
            )
          )}
          {touch && !status && (
            <p className="text-muted-foreground">Tap “…” to rename, move or delete.</p>
          )}
          {keyHints && (
            <p className="text-muted-foreground">
              ↑ ↓ move · → ← open, close · Enter open · F2 rename · Delete delete ·{" "}
              {variant === "menu" ? "Shift+F10 actions" : "Space select"}
            </p>
          )}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        aria-label="Add files"
        onChange={(e) => {
          doImport(
            importTarget.current,
            [...(e.target.files ?? [])].map((f) => f.name),
          );
          e.target.value = "";
        }}
      />

      {menu && (
        <ActionMenu
          label={menu.path ? `Actions for ${nameOf(menu.path)}` : "Actions for your folder"}
          items={menu.path ? actionsFor(menu.path) : rootActions}
          anchor={menu.anchor}
          onClose={() => {
            if (menu.path) focusRow(menu.path);
            setMenu(null);
          }}
        />
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                deleteMode === "permanent" && "bg-destructive hover:bg-destructive/90 text-white",
              )}
              onClick={() => confirm && doDelete(confirm)}
            >
              {confirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={moving !== null} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent className="max-h-[85svh] grid-rows-[auto_minmax(0,1fr)]">
          <DialogHeader className="min-w-0">
            <DialogTitle className="break-words">
              Move{" "}
              {moving?.length === 1 ? `“${nameOf(moving[0] ?? "")}”` : `${moving?.length} items`}{" "}
              to…
            </DialogTitle>
            <DialogDescription>Choose a folder.</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 content-start overflow-y-auto">
            {["", ...listFolders(tree)].map((f) => {
              const blocked = moving?.some((p) => moveError(tree, p, f));
              return (
                <button
                  key={f || "/"}
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    if (moving) doMove(moving, f);
                    setMoving(null);
                  }}
                  className="hover:bg-accent flex min-h-10 min-w-0 items-center gap-2 rounded-md pr-2 text-left text-sm disabled:opacity-40"
                  style={{ paddingLeft: 8 + (f ? f.split("/").length : 0) * 14 }}
                >
                  <Folder className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate">{f ? nameOf(f) : "Atelier docs"}</span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RenameInput({
  draft,
  error,
  onChange,
  onCommit,
  onCancel,
}: {
  draft: string;
  error?: string;
  onChange: (draft: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <span className="grid min-w-0 flex-1 gap-0.5 py-1">
      <input
        // biome-ignore lint/a11y/noAutofocus: the field appears because the user asked to rename
        autoFocus
        aria-label="New name"
        aria-invalid={!!error}
        aria-describedby={error ? "rename-error" : undefined}
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        // The name is selected without its extension, as file managers do.
        onFocus={(e) => {
          const dot = draft.lastIndexOf(".");
          e.target.setSelectionRange(0, dot > 0 ? dot : draft.length);
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !error) onCommit();
          else if (e.key === "Escape") onCancel();
        }}
        onBlur={() => (error ? onCancel() : onCommit())}
        className={cn(
          "bg-background h-7 w-full min-w-0 rounded-sm border px-1.5 text-sm outline-none focus:ring-2",
          error ? "border-destructive focus:ring-destructive/30" : "focus:ring-ring/40",
        )}
      />
      {error && (
        <span id="rename-error" role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
    </span>
  );
}
