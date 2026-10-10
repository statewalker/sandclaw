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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@statewalker/ui.view.shadcn";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  FileText,
  FolderInput,
  GripVertical,
  type LucideIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  type DragEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { folder } from "../mock.js";
import { topics as askTopics, dupontToc } from "./toc-mock.js";
import {
  accept,
  addSection,
  rows as allRows,
  attach,
  detach,
  filePaths,
  findRow,
  indent,
  MAX_LEVELS,
  moveBy,
  moveError,
  moveSection,
  outdent,
  type Place,
  type Proposal,
  pageChanges,
  proposals,
  type Result,
  type Row,
  removeSection,
  renameSection,
  type Section,
  type Source,
  sourceKey,
  suggestToc,
  type Toc,
  type Topic,
} from "./toc-model.js";

/**
 * - `split`: the tree on the left, the selected section's title and sources on
 *   the right (stacked on a narrow screen);
 * - `outline`: one outline; a row opens in place to show its sources as chips.
 */
export type TocVariant = "split" | "outline";

export interface TocEditorProps {
  variant?: TocVariant;
  /** The site's name. */
  site?: string;
  toc?: Toc;
  /** The TOC as last saved; `toc` by default (nothing unsaved). */
  saved?: Toc;
  topics?: Topic[];
  /** The folder's files, as paths. */
  files?: string[];
  /** A touch screen: no drag and drop, "…" always visible, "Move to…" instead. */
  touch?: boolean;
  keyHints?: boolean;
  /** Where a story starts. */
  selected?: string;
  expanded?: string[];
  dragging?: { id: string; over: string; place: Place };
  picker?: { kind: "topic" | "file"; query?: string };
  suggesting?: boolean;
}

interface Status {
  text: string;
  undo?: Toc;
}

const LEVEL_WORDS: Record<Place, string> = { before: "before", after: "after", inside: "under" };

function topicLabel(topics: Topic[], id: string) {
  const t = topics.find((x) => x.id === id);
  return t ? `${t.name} (${t.docs})` : id;
}

function sourceLabel(topics: Topic[], s: Source) {
  return s.kind === "topic" ? topicLabel(topics, s.id) : (s.path.split("/").at(-1) ?? s.path);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface MenuItem {
  label: string;
  icon: LucideIcon;
  run: () => void;
  destructive?: boolean;
  disabled?: boolean;
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
    ref.current?.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")?.focus();
  }, []);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [onClose]);

  const onKeyDown = (e: KeyboardEvent) => {
    const all = [
      ...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not(:disabled)") ?? []),
    ];
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

  const below = anchor.bottom + items.length * 36 + 16 < window.innerHeight;
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="bg-popover text-popover-foreground fixed z-50 grid min-w-48 rounded-md border p-1 shadow-md"
      style={{
        right: Math.max(8, window.innerWidth - anchor.right),
        ...(below
          ? { top: anchor.bottom + 4 }
          : { bottom: Math.max(8, window.innerHeight - anchor.top + 4) }),
      }}
    >
      {items.map(({ label, icon: Icon, run, destructive, disabled }) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => {
            onClose();
            run();
          }}
          className={cn(
            "hover:bg-accent focus:bg-accent flex h-8 items-center gap-2 rounded-sm px-2 text-left text-sm outline-none disabled:opacity-40",
            destructive && "text-destructive",
          )}
        >
          <Icon className="size-4" /> {label}
        </button>
      ))}
    </div>
  );
}

function NoSourcesWarning() {
  return (
    <p className="bg-warning/10 text-foreground flex gap-2 rounded-md border border-warning/40 p-2 text-sm">
      <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" />
      <span>The assistant has nothing to write this page from. Add a topic or a file.</span>
    </p>
  );
}

/** A section's sources as chips, with the buttons to add more. */
function SourcesEditor({
  section,
  topics,
  onRemove,
  onAdd,
}: {
  section: Section;
  topics: Topic[];
  onRemove: (s: Source) => void;
  onAdd: (kind: "topic" | "file") => void;
}) {
  return (
    <div className="grid gap-2">
      {section.sources.length === 0 ? (
        <NoSourcesWarning />
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Sources of “${section.title}”`}>
          {section.sources.map((s) => {
            const label = sourceLabel(topics, s);
            const Icon = s.kind === "topic" ? Tag : FileText;
            return (
              <li
                key={sourceKey(s)}
                title={s.kind === "file" ? s.path : undefined}
                className="bg-secondary flex max-w-full min-w-0 items-center gap-1 rounded-full py-0.5 pr-0.5 pl-2 text-xs"
              >
                <Icon className="text-muted-foreground size-3 shrink-0" />
                <span className="truncate">{label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={() => onRemove(s)}
                  className="hover:bg-background grid size-5 shrink-0 place-items-center rounded-full"
                >
                  <X className="size-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onAdd("topic")}>
          <Tag /> Add topic
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAdd("file")}>
          <FileText /> Add file
        </Button>
      </div>
    </div>
  );
}

/** A searchable list of topics or files; each click attaches or detaches one. */
function SourcePicker({
  kind,
  section,
  topics,
  files,
  initialQuery = "",
  onToggle,
  onClose,
}: {
  kind: "topic" | "file";
  section: Section;
  topics: Topic[];
  files: string[];
  initialQuery?: string;
  onToggle: (s: Source) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const q = query.trim().toLowerCase();
  const options: { source: Source; label: string; detail: string }[] =
    kind === "topic"
      ? topics.map((t) => ({
          source: { kind: "topic", id: t.id },
          label: t.name,
          detail: plural(t.docs, "document"),
        }))
      : files.map((path) => ({
          source: { kind: "file", path },
          label: path.split("/").at(-1) ?? path,
          detail: path.split("/").slice(0, -1).join(" / ") || "Your folder",
        }));
  const shown = options.filter((o) => `${o.label} ${o.detail}`.toLowerCase().includes(q));
  const has = new Set(section.sources.map(sourceKey));
  const noun = kind === "topic" ? "topics" : "files";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85svh] grid-rows-[auto_auto_minmax(0,1fr)_auto]">
        <DialogHeader className="min-w-0">
          <DialogTitle className="break-words">
            Add {noun} to “{section.title}”
          </DialogTitle>
          <DialogDescription>
            {kind === "topic"
              ? "Topics Ask found in your files. The page is written from the documents each covers."
              : "The page is written from the files you pick."}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            aria-label={`Search ${noun}`}
            placeholder={`Search ${noun}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="grid min-h-0 content-start overflow-y-auto">
          {shown.length === 0 && (
            <p className="text-muted-foreground p-4 text-center text-sm">
              No {noun} match “{query.trim()}”.
            </p>
          )}
          {shown.map((o) => {
            const on = has.has(sourceKey(o.source));
            return (
              <button
                key={sourceKey(o.source)}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(o.source)}
                className="hover:bg-accent flex min-h-10 min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm"
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-sm border",
                    on && "bg-primary border-primary text-primary-foreground",
                  )}
                >
                  {on && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                <span className="text-muted-foreground shrink-0 truncate text-xs">{o.detail}</span>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TocEditor({
  variant = "split",
  site = "Dupont renovation",
  toc: initialToc = dupontToc,
  saved: initialSaved,
  topics = askTopics,
  files = filePaths(folder),
  touch = false,
  keyHints = false,
  selected: initialSelected,
  expanded: initialExpanded = [],
  dragging,
  picker: initialPicker,
  suggesting = false,
}: TocEditorProps) {
  const [toc, setToc] = useState(initialToc);
  const [saved, setSaved] = useState(initialSaved ?? initialToc);
  /** Saved without rewriting: these pages are still out of date. */
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | undefined>(
    initialSelected ?? (variant === "split" ? initialToc[0]?.id : undefined),
  );
  const [focusId, setFocusId] = useState(selected ?? "");
  const [expanded, setExpanded] = useState(() => new Set(initialExpanded));
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | undefined>();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; anchor: DOMRect } | null>(null);
  const [drag, setDrag] = useState<{ id: string; over: string | null; place: Place } | null>(
    dragging ?? null,
  );
  const [picker, setPicker] = useState(
    initialPicker && initialSelected ? { ...initialPicker, id: initialSelected } : null,
  );
  const [offers, setOffers] = useState<Proposal[] | null>(() =>
    suggesting ? proposals(initialToc, suggestToc(topics)) : null,
  );
  const [status, setStatus] = useState<Status | undefined>();

  const rowRefs = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (pendingFocus.current === null || renaming) return;
    rowRefs.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });

  const rows = allRows(toc);
  const tabStop = rows.some((r) => r.section.id === focusId)
    ? focusId
    : (rows[0]?.section.id ?? "");
  const changes = pageChanges(saved, toc);
  const outdated = new Set(
    [...changes.rewrite, ...pending].filter((id) => rows.some((r) => r.section.id === id)),
  );
  const writable = [...outdated].filter((id) => findRow(toc, id)?.section.sources.length);
  const dirty = JSON.stringify(saved) !== JSON.stringify(toc);
  const current = selected ? findRow(toc, selected)?.section : undefined;

  const focusRow = (id: string) => {
    setFocusId(id);
    pendingFocus.current = id;
  };
  const edit = (next: Toc, text?: string) => {
    setStatus(text ? { text, undo: toc } : undefined);
    setToc(next);
  };
  /** Applies a move, keeping the moved row focused; a refusal is said in the status line. */
  const applyMove = (id: string, r: Result) => {
    if ("error" in r) return setStatus({ text: r.error });
    edit(r.toc);
    focusRow(id);
  };

  const add = (target: string | null, place: Place) => {
    const r = addSection(toc, target, place);
    edit(r.toc);
    setSelected(r.id);
    setFocusId(r.id);
    setRenaming({ id: r.id, draft: "New section" });
  };
  const commitRename = () => {
    if (!renaming) return;
    const title = renaming.draft.trim();
    setRenaming(undefined);
    if (title) edit(renameSection(toc, renaming.id, title));
    focusRow(renaming.id);
  };

  const askRemove = (id: string) => {
    const s = findRow(toc, id)?.section;
    if (!s) return;
    if (s.children.length || s.sources.length) setConfirm(id);
    else doRemove(id);
  };
  const doRemove = (id: string) => {
    const s = findRow(toc, id)?.section;
    const i = rows.findIndex((r) => r.section.id === id);
    edit(removeSection(toc, id), `Removed “${s?.title}”.`);
    if (selected === id) setSelected(undefined);
    const after = rows.slice(i + 1).find((r) => r.depth <= (rows[i]?.depth ?? 0));
    const neighbour = rows[i - 1] ?? after;
    if (neighbour) focusRow(neighbour.section.id);
  };

  const toggleSource = (id: string, s: Source) => {
    const has = findRow(toc, id)?.section.sources.some((x) => sourceKey(x) === sourceKey(s));
    edit(has ? detach(toc, id, s) : attach(toc, id, s));
  };

  const suggest = () => {
    const suggestion = suggestToc(topics);
    if (toc.length === 0) {
      edit(
        suggestion,
        `Suggested ${plural(suggestion.length, "section")} from your topics. Rename, reorder or remove any of them.`,
      );
      return;
    }
    const list = proposals(toc, suggestion);
    if (list.length) setOffers(list);
    else setStatus({ text: "Every topic is already in your table of contents." });
  };
  const acceptOffer = (p: Proposal) => {
    edit(accept(toc, p));
    setOffers((list) => {
      const rest = (list ?? []).filter((x) => x !== p);
      return rest.length ? rest : null;
    });
  };
  const acceptAll = () => {
    edit((offers ?? []).reduce(accept, toc), `Added ${plural(offers?.length ?? 0, "suggestion")}.`);
    setOffers(null);
  };

  const save = (rewrite: boolean) => {
    setSaved(toc);
    setPending(rewrite ? new Set() : outdated);
    const skipped = outdated.size - writable.length;
    setStatus({
      text: rewrite
        ? `Saved. Rewriting ${plural(writable.length, "page")}…${skipped ? ` ${plural(skipped, "page")} with nothing to write from stay${skipped === 1 ? "s" : ""} empty.` : ""}`
        : `Saved. ${plural(outdated.size, "page")} still to rewrite.`,
    });
  };

  // --- Keyboard on rows ---

  const onRowKey = (e: KeyboardEvent<HTMLElement>, row: Row) => {
    if (e.target !== e.currentTarget) return;
    const id = row.section.id;
    const i = rows.findIndex((r) => r.section.id === id);
    const step = (j: number) => {
      const to = rows[j];
      if (to) focusRow(to.section.id);
    };
    if (e.altKey) {
      if (e.key === "ArrowUp") applyMove(id, moveBy(toc, id, -1));
      else if (e.key === "ArrowDown") applyMove(id, moveBy(toc, id, 1));
      else if (e.key === "ArrowRight") applyMove(id, indent(toc, id));
      else if (e.key === "ArrowLeft") applyMove(id, outdent(toc, id));
      else return;
      e.preventDefault();
      return;
    }
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
      case "Enter":
        open(id);
        break;
      case "F2":
        setRenaming({ id, draft: row.section.title });
        break;
      case "Delete":
        askRemove(id);
        break;
      case "ContextMenu":
        openMenu(id, e.currentTarget);
        break;
      default:
        if (e.key === "F10" && e.shiftKey) {
          openMenu(id, e.currentTarget);
          break;
        }
        return;
    }
    e.preventDefault();
  };

  /** A: shows the section's details; B: opens or closes its sources. */
  const open = (id: string) => {
    setSelected(id);
    setFocusId(id);
    if (variant === "outline")
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
  };
  const openMenu = (id: string, anchor: HTMLElement) => {
    setFocusId(id);
    setMenu({ id, anchor: anchor.getBoundingClientRect() });
  };

  // --- Drag and drop ---

  const placeAt = (e: DragEvent<HTMLElement>, row: Row): Place => {
    const box = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - box.top) / (box.height || 1);
    if (y < 0.3) return "before";
    if (y > 0.7 || row.depth + 1 >= MAX_LEVELS) return y < 0.5 ? "before" : "after";
    return "inside";
  };
  const onDragOver = (e: DragEvent<HTMLElement>, row: Row) => {
    if (!drag) return;
    const place = placeAt(e, row);
    if (moveError(toc, drag.id, row.section.id, place)) {
      if (drag.over !== null) setDrag({ ...drag, over: null });
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (drag.over !== row.section.id || drag.place !== place)
      setDrag({ ...drag, over: row.section.id, place });
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (drag?.over) applyMove(drag.id, moveSection(toc, drag.id, drag.over, drag.place));
    setDrag(null);
  };

  const titleOf = (id: string | null | undefined) => (id && findRow(toc, id)?.section.title) || "";
  const dropHint =
    drag?.over != null
      ? `Move “${titleOf(drag.id)}” ${LEVEL_WORDS[drag.place]} “${titleOf(drag.over)}”`
      : undefined;

  // --- Actions offered for a section ---

  const actionsFor = (id: string): MenuItem[] => {
    const row = findRow(toc, id);
    const deep = (row?.depth ?? 0) + 1 >= MAX_LEVELS;
    return [
      {
        label: "Rename",
        icon: Pencil,
        run: () => setRenaming({ id, draft: row?.section.title ?? "" }),
      },
      { label: "Add section after", icon: Plus, run: () => add(id, "after") },
      {
        label: "Add section under",
        icon: CornerDownRight,
        run: () => add(id, "inside"),
        disabled: deep,
      },
      { label: "Move up", icon: ArrowUp, run: () => applyMove(id, moveBy(toc, id, -1)) },
      { label: "Move down", icon: ArrowDown, run: () => applyMove(id, moveBy(toc, id, 1)) },
      { label: "Move to…", icon: FolderInput, run: () => setMoving(id) },
      { label: "Remove…", icon: Trash2, run: () => askRemove(id), destructive: true },
    ];
  };

  // --- The remove confirmation's words ---

  const confirmSection = confirm ? findRow(toc, confirm)?.section : undefined;
  const subPages = confirmSection ? allRows(confirmSection.children).map((r) => r.section) : [];

  // --- Rendering ---

  const renderRow = (row: Row) => {
    const { section, depth } = row;
    const id = section.id;
    const isRenaming = renaming?.id === id;
    const isOpen = variant === "outline" && expanded.has(id);
    const isTarget = drag?.over === id;
    const empty = section.sources.length === 0;
    return (
      <div key={id}>
        <div
          ref={(el) => {
            if (el) rowRefs.current.set(id, el);
            else rowRefs.current.delete(id);
          }}
          role="treeitem"
          aria-label={section.title}
          aria-level={depth + 1}
          aria-selected={variant === "split" ? selected === id : undefined}
          aria-describedby={empty ? `toc-empty-${id}` : undefined}
          tabIndex={id === tabStop ? 0 : -1}
          draggable={!touch && !isRenaming}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", section.title);
            e.dataTransfer.effectAllowed = "move";
            setDrag({ id, over: null, place: "after" });
          }}
          onDragEnd={() => setDrag(null)}
          onDragOver={(e) => onDragOver(e, row)}
          onDrop={onDrop}
          onClick={() => open(id)}
          onDoubleClick={() => setRenaming({ id, draft: section.title })}
          onKeyDown={(e) => onRowKey(e, row)}
          onContextMenu={(e) => {
            e.preventDefault();
            openMenu(id, e.currentTarget);
          }}
          className={cn(
            "group hover:bg-accent focus-visible:ring-ring relative flex min-w-0 cursor-default items-center gap-1.5 rounded-md pr-1 text-sm outline-none focus-visible:ring-2",
            touch ? "min-h-11" : "min-h-9",
            variant === "split" && selected === id && "bg-accent",
            drag?.id === id && "opacity-50",
            isTarget && drag?.place === "inside" && "bg-primary/10 ring-primary ring-2 ring-inset",
          )}
          style={{ paddingLeft: 4 + depth * 20 }}
        >
          {isTarget && drag?.place !== "inside" && (
            <span
              aria-hidden
              className={cn(
                "bg-primary pointer-events-none absolute right-1 h-0.5 rounded-full",
                drag?.place === "before" ? "-top-px" : "-bottom-px",
              )}
              style={{ left: 4 + depth * 20 }}
            />
          )}
          {!touch && (
            <GripVertical
              aria-hidden
              className="text-muted-foreground/50 size-3.5 shrink-0 cursor-grab"
            />
          )}
          {variant === "outline" && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`${isOpen ? "Hide" : "Show"} the sources of ${section.title}`}
              aria-expanded={isOpen}
              onClick={(e) => {
                e.stopPropagation();
                open(id);
              }}
              className="text-muted-foreground grid size-6 shrink-0 place-items-center"
            >
              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          )}
          {isRenaming ? (
            <TitleInput
              draft={renaming.draft}
              onChange={(draft) => setRenaming({ id, draft })}
              onCommit={commitRename}
              onCancel={() => {
                setRenaming(undefined);
                focusRow(id);
              }}
            />
          ) : (
            <span className={cn("min-w-0 flex-1 truncate py-1", depth === 0 && "font-medium")}>
              {section.title}
            </span>
          )}
          {!isRenaming && empty && (
            <span
              id={`toc-empty-${id}`}
              title="Nothing to write this page from"
              className="shrink-0"
            >
              <TriangleAlert
                className="text-warning size-4"
                aria-label="Nothing to write this page from"
              />
            </span>
          )}
          {!isRenaming && outdated.has(id) && (
            <span className="text-primary flex shrink-0 items-center gap-1 text-xs">
              <RefreshCw className="size-3" aria-hidden />
              <span className={cn(touch && "sr-only")}>Will be rewritten</span>
            </span>
          )}
          {!isRenaming && (
            <Button
              size="icon"
              variant="ghost"
              tabIndex={-1}
              aria-label={`Actions for ${section.title}`}
              aria-haspopup="menu"
              className={cn(
                "size-7 shrink-0",
                !touch && "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                (touch || selected === id) && "opacity-100",
              )}
              onClick={(e) => {
                e.stopPropagation();
                openMenu(id, e.currentTarget);
              }}
            >
              <MoreHorizontal />
            </Button>
          )}
        </div>
        {isOpen && (
          <div className="pt-1 pb-3" style={{ paddingLeft: 34 + depth * 20 }}>
            <SourcesEditor
              section={section}
              topics={topics}
              onRemove={(s) => toggleSource(id, s)}
              onAdd={(kind) => setPicker({ kind, id })}
            />
          </div>
        )}
      </div>
    );
  };

  const tree = (
    <div
      role="tree"
      aria-label={`Table of contents of ${site}`}
      className="grid content-start p-1"
      onDragLeave={(e) => {
        if (drag && !e.currentTarget.contains(e.relatedTarget as Node))
          setDrag({ ...drag, over: null });
      }}
    >
      {rows.map(renderRow)}
    </div>
  );

  const details = current && (
    <section
      aria-label="Section details"
      className="grid content-start gap-4 border-t p-4 @3xl:border-t-0 @3xl:border-l"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="toc-title">Page title</Label>
        <Input
          id="toc-title"
          value={current.title}
          onChange={(e) => edit(renameSection(toc, current.id, e.target.value))}
        />
        {outdated.has(current.id) && (
          <p className="text-primary flex items-center gap-1 text-xs">
            <RefreshCw className="size-3" /> This page will be rewritten.
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <h3 className="text-sm font-medium">Written from</h3>
        <SourcesEditor
          section={current}
          topics={topics}
          onRemove={(s) => toggleSource(current.id, s)}
          onAdd={(kind) => setPicker({ kind, id: current.id })}
        />
      </div>
      {current.children.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Pages under it: {current.children.map((c) => c.title).join(", ")}.
        </p>
      )}
    </section>
  );

  const pickerSection = picker ? findRow(toc, picker.id)?.section : undefined;
  const movingRow = moving ? findRow(toc, moving) : undefined;

  return (
    <div
      className={cn(
        "bg-background @container w-full overflow-hidden rounded-lg border",
        variant === "split" ? "max-w-4xl" : "max-w-2xl",
      )}
    >
      <header className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="mr-auto min-w-0">
          <h2 className="truncate font-semibold">{site}</h2>
          <p className="text-muted-foreground text-xs">
            Table of contents · each section is a page
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={suggest}>
          <Sparkles /> Suggest from topics
        </Button>
        {toc.length > 0 && (
          <Button
            size="sm"
            onClick={() => (selected ? add(selected, "after") : add(null, "after"))}
          >
            <Plus /> Add section
          </Button>
        )}
      </header>

      {offers && (
        <section aria-label="Suggestion" className="bg-primary/5 grid gap-2 border-b p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-auto flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-4 text-violet-500" /> Suggested from your topics
            </h3>
            <div className="flex gap-2">
              <Button size="sm" onClick={acceptAll}>
                Add all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOffers(null)}>
                Close
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            Only additions: your sections, titles and order stay as they are.
          </p>
          <ul className="grid gap-1">
            {offers.map((p) => (
              <li
                key={p.kind === "add" ? p.section.id : p.sectionId}
                className="bg-background flex min-w-0 items-center gap-2 rounded-md border p-2 text-sm"
              >
                <Plus className="size-4 shrink-0 text-green-600" aria-hidden />
                <span className="min-w-0 flex-1">
                  {p.kind === "add" ? (
                    <>
                      New section <strong>“{p.section.title}”</strong>
                      <span className="text-muted-foreground block text-xs">
                        from {p.section.sources.map((s) => sourceLabel(topics, s)).join(", ")}
                      </span>
                    </>
                  ) : (
                    <>
                      Add to <strong>“{p.title}”</strong>
                      <span className="text-muted-foreground block text-xs">
                        {p.topics.map((t) => topicLabel(topics, t)).join(", ")}
                      </span>
                    </>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Accept: ${p.kind === "add" ? `new section ${p.section.title}` : `add to ${p.title}`}`}
                  onClick={() => acceptOffer(p)}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {toc.length === 0 ? (
        <div className="grid justify-items-center gap-3 p-8 text-center">
          <p className="font-medium">No sections yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Each section becomes a page of the site. Start from the {plural(topics.length, "topic")}{" "}
            Ask found in your files, or add sections yourself.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={suggest}>
              <Sparkles /> Suggest from topics
            </Button>
            <Button variant="outline" onClick={() => add(null, "after")}>
              <Plus /> Add section
            </Button>
          </div>
        </div>
      ) : variant === "split" ? (
        <div className="grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {tree}
          {details}
        </div>
      ) : (
        tree
      )}

      {(dropHint || status || dirty || outdated.size > 0 || touch || keyHints) && (
        <footer className="grid gap-2 border-t p-3 text-xs">
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
                      if (status.undo) setToc(status.undo);
                      setStatus({ text: "Undone." });
                    }}
                  >
                    Undo
                  </button>
                )}
              </p>
            )
          )}
          {(dirty || outdated.size > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-auto min-w-0">
                {dirty ? "Unsaved changes. " : ""}
                {outdated.size > 0
                  ? `${plural(outdated.size, "page")} will be rewritten`
                  : "Only the menu changes; no page is rewritten"}
                {changes.removed.length > 0 &&
                  `; ${plural(changes.removed.length, "page")} taken off the site (${changes.removed.join(", ")})`}
                .
              </p>
              {dirty && (
                <Button size="sm" variant="outline" onClick={() => save(false)}>
                  Save
                </Button>
              )}
              {writable.length > 0 && (
                <Button size="sm" onClick={() => save(true)}>
                  <RefreshCw /> {dirty ? "Save and rewrite" : "Rewrite"}{" "}
                  {plural(writable.length, "page")}
                </Button>
              )}
            </div>
          )}
          {touch && !status && !dirty && (
            <p className="text-muted-foreground">Tap “…” to rename, move or remove a section.</p>
          )}
          {keyHints && (
            <p className="text-muted-foreground">
              ↑ ↓ move · Enter open · F2 rename · Delete remove · Alt+↑ ↓ reorder · Alt+→ under the
              section above · Alt+← out · Shift+F10 actions
            </p>
          )}
        </footer>
      )}

      {menu && (
        <ActionMenu
          label={`Actions for ${titleOf(menu.id)}`}
          items={actionsFor(menu.id)}
          anchor={menu.anchor}
          onClose={() => {
            focusRow(menu.id);
            setMenu(null);
          }}
        />
      )}

      {picker && pickerSection && (
        <SourcePicker
          kind={picker.kind}
          section={pickerSection}
          topics={topics}
          files={files}
          initialQuery={picker.query}
          onToggle={(s) => toggleSource(picker.id, s)}
          onClose={() => setPicker(null)}
        />
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">
              Remove “{confirmSection?.title}”
              {subPages.length > 0 && ` and ${plural(subPages.length, "page")} under it`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {subPages.length > 0 && `${subPages.map((s) => `“${s.title}”`).join(", ")} go too. `}
              The {subPages.length ? "pages leave" : "page leaves"} the site when you save. Your
              files and topics stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && doRemove(confirm)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={moving !== null} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent className="max-h-[85svh] grid-rows-[auto_minmax(0,1fr)]">
          <DialogHeader className="min-w-0">
            <DialogTitle className="break-words">Move “{movingRow?.section.title}” to…</DialogTitle>
            <DialogDescription>It goes last there; Move up and down fine-tune.</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 content-start overflow-y-auto">
            {[null, ...toc.map((s) => s.id)].map((target) => {
              const blocked =
                !moving ||
                (target === null
                  ? movingRow?.parent === null
                  : target === movingRow?.parent || !!moveError(toc, moving, target, "inside"));
              return (
                <button
                  key={target ?? "/"}
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    if (moving) applyMove(moving, moveSection(toc, moving, target, "inside"));
                    setMoving(null);
                  }}
                  className="hover:bg-accent flex min-h-10 min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm disabled:opacity-40"
                  style={{ paddingLeft: target ? 28 : 8 }}
                >
                  <span className="truncate">
                    {target ? `Under “${titleOf(target)}”` : "Top level of the site"}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TitleInput({
  draft,
  onChange,
  onCommit,
  onCancel,
}: {
  draft: string;
  onChange: (draft: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const empty = !draft.trim();
  return (
    <span className="grid min-w-0 flex-1 gap-0.5 py-1">
      <input
        // biome-ignore lint/a11y/noAutofocus: the field appears because the user asked to rename
        autoFocus
        aria-label="Section title"
        aria-invalid={empty}
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !empty) onCommit();
          else if (e.key === "Escape") onCancel();
        }}
        onBlur={() => (empty ? onCancel() : onCommit())}
        className={cn(
          "bg-background h-7 w-full min-w-0 rounded-sm border px-1.5 text-sm outline-none focus:ring-2",
          empty ? "border-destructive focus:ring-destructive/30" : "focus:ring-ring/40",
        )}
      />
      {empty && (
        <span role="alert" className="text-destructive text-xs">
          Type a title.
        </span>
      )}
    </span>
  );
}
