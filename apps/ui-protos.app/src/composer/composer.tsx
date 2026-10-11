import {
  type TextMessagePartComponent,
  type ToolCallMessagePartComponent,
  useAuiState,
} from "@assistant-ui/react";
import {
  Button,
  Card,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@statewalker/ui.view.shadcn";
import {
  CircleAlert,
  Clock,
  File as FileIcon,
  FileSearch,
  FileText,
  Folder,
  HardDrive,
  Paperclip,
  Plus,
  SendHorizontal,
  Square,
  X,
} from "lucide-react";
import {
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  DeliveredAttachment,
  FlueConversationMessage,
  FlueConversationPart,
} from "../chat/flue.js";
import { createMockFlueSession, type ScriptedAgent } from "../chat/flue-runtime.js";
import { createFlueOutbox, type FlueOutbox, useFlueOutbox } from "../chat/outbox.js";
import { FlueThread } from "../chat/thread.js";
import {
  chipLabel,
  decodeBody,
  encodeBody,
  findReference,
  folderReferences,
  matchReferences,
  nameOf,
  parentOf,
  type Reference,
} from "./references.js";

/**
 * A — chips above the input, an attach button with a menu (from your folder /
 * from this computer). B — one "+" (from this computer) and `@` for the folder;
 * the files referred to stay inline in the text.
 */
export type ComposerVariant = "A" | "B";

/** What the story's prototype controls can do to the composer. */
export interface ComposerHandle {
  /** A file or folder dragged from the folder tree and dropped on the composer. */
  dropPath(path: string): void;
  /** Files dropped (or picked) from the computer. */
  dropFiles(files: File[]): void;
}

export interface Notice {
  kind: "outside" | "too-big";
  filename: string;
}

/** Flue's limit on an attachment. */
const MAX_BYTES = 14 * 1024 * 1024;
/** Dragged from the folder tree: the entry's path. */
export const FOLDER_PATH_TYPE = "application/x-sandclaw-path";

const sendable = (file: File) => file.type.startsWith("image/") || file.type === "application/pdf";

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const token = (ref: Reference) => `@${chipLabel(ref)}`;

/** The `@` being typed before the caret, if any. */
function findMention(text: string, caret: number, tokens: string[]) {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start < 0 || (start > 0 && !/\s/.test(before[start - 1] ?? ""))) return undefined;
  const query = before.slice(start + 1);
  if (query.includes("\n") || query.length > 40) return undefined;
  // A mention already picked (variant B) is not reopened.
  if (tokens.some((t) => text.startsWith(t, start))) return undefined;
  return { start, query };
}

// --- Chips ---------------------------------------------------------------

function Chip({
  icon,
  label,
  detail,
  onRemove,
  className,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-secondary text-secondary-foreground inline-flex max-w-full min-w-0 items-center gap-1 rounded-md py-0.5 pr-1 pl-1.5 text-xs [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {detail && <span className="shrink-0 opacity-70">· {detail}</span>}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className="hover:bg-foreground/10 rounded p-0.5"
        >
          <X />
        </button>
      )}
    </span>
  );
}

const filesDetail = (ref: Reference) =>
  ref.kind === "folder" ? `${ref.files} file${ref.files === 1 ? "" : "s"}` : undefined;

function RefChip({
  refer,
  onRemove,
  className,
}: {
  refer: Reference;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <Chip
      icon={refer.kind === "folder" ? <Folder /> : <FileText />}
      label={chipLabel(refer)}
      detail={filesDetail(refer)}
      onRemove={onRemove}
      className={className}
    />
  );
}

function AttachmentChip({ file, onRemove }: { file: DeliveredAttachment; onRemove?: () => void }) {
  return (
    <Chip
      icon={
        file.type === "image" ? (
          <img
            src={`data:${file.mimeType};base64,${file.data}`}
            alt=""
            className="size-4 shrink-0 rounded-sm object-cover"
          />
        ) : (
          <FileIcon />
        )
      }
      label={file.filename ?? (file.type === "image" ? "Image" : "PDF")}
      detail="from this computer"
      onRemove={onRemove}
    />
  );
}

// --- Sent and pending messages -----------------------------------------

/** User text with the files it refers to: chips, and `@` mentions highlighted. */
function BodyView({ body }: { body: string }) {
  const { refs, text } = decodeBody(body);
  const inline = refs.filter((r) => text.includes(token(r)));
  const chips = refs.filter((r) => !inline.includes(r));
  const pattern = inline.length
    ? new RegExp(
        `(${inline.map((r) => token(r).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
      )
    : undefined;
  return (
    <>
      {chips.length > 0 && (
        <ul aria-label="Files referred to" className="mb-1.5 flex flex-wrap gap-1">
          {chips.map((r) => (
            <li key={r.path} className="max-w-full">
              <RefChip refer={r} className="bg-primary-foreground/15 text-inherit" />
            </li>
          ))}
        </ul>
      )}
      {text && (
        <p className="whitespace-pre-wrap">
          {pattern
            ? text.split(pattern).map((piece, i) =>
                i % 2 ? (
                  <mark key={i} className="bg-primary-foreground/20 rounded-sm text-inherit">
                    {piece}
                  </mark>
                ) : (
                  piece
                ),
              )
            : text}
        </p>
      )}
    </>
  );
}

/** A sent user message's text. */
export const ReferenceText: TextMessagePartComponent = ({ text }) => <BodyView body={text} />;

/** Messages queued behind the running answer, or not sent. */
export function PendingMessages({
  outbox,
  autoRetry,
}: {
  outbox: FlueOutbox;
  autoRetry?: boolean;
}) {
  const pending = useFlueOutbox(outbox);
  return pending.map((p) => {
    const files = p.message.kind === "user" ? (p.message.attachments ?? []) : [];
    return (
      <div key={p.id} className="flex flex-col items-end gap-1" data-testid="pending-message">
        <div
          className={cn(
            "bg-primary text-primary-foreground max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
            p.state === "queued" ? "opacity-60" : "opacity-80",
          )}
        >
          <BodyView body={p.message.body} />
          {files.map((f) => (
            <span key={f.filename} className="mt-1 flex items-center gap-1.5 text-xs">
              <FileIcon className="size-3.5" /> {f.filename}
            </span>
          ))}
        </div>
        <div
          className={cn(
            "flex max-w-[85%] flex-wrap items-center justify-end gap-x-2 text-xs",
            p.state === "failed" ? "text-destructive" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {p.state === "queued" ? (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" /> Will be sent after the current answer
            </span>
          ) : (
            <span className="text-right">
              <CircleAlert className="mr-1 inline size-3.5 align-[-3px]" />
              Not sent — the Sandclaw machine isn't answering.
              {autoRetry && " It will be sent when the machine is back."}
            </span>
          )}
          {p.state === "failed" && (
            <Button
              size="sm"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => outbox.retry(p.id)}
            >
              Retry
            </Button>
          )}
          <Button
            size="sm"
            variant="link"
            className="text-muted-foreground h-auto p-0 text-xs"
            onClick={() => outbox.remove(p.id)}
          >
            Remove
          </Button>
        </div>
      </div>
    );
  });
}

// --- Pickers -------------------------------------------------------------

const depth = (path: string) => path.split("/").length - 1;

/** "From your folder": the folder's files and folders, searchable. */
function FolderPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (ref: Reference) => void;
}) {
  const [query, setQuery] = useState("");
  const items = query.trim() ? matchReferences(query, 50) : folderReferences();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] grid-rows-[auto_auto_minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>Add from your folder</DialogTitle>
          <DialogDescription>
            The assistant reads what you add from your folder, on this device.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Search your folder"
          placeholder="Search your folder…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="min-h-0 overflow-y-auto">
          {items.map((r) => (
            <li key={r.path}>
              <button
                type="button"
                aria-label={`Add ${chipLabel(r)}`}
                onClick={() => {
                  onPick(r);
                  onOpenChange(false);
                  setQuery("");
                }}
                style={{ paddingLeft: query.trim() ? undefined : `${0.5 + depth(r.path)}rem` }}
                className="hover:bg-muted flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
              >
                {r.kind === "folder" ? (
                  <Folder className="size-4 shrink-0" />
                ) : (
                  <FileText className="size-4 shrink-0" />
                )}
                <span className="truncate">{nameOf(r.path)}</span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {r.kind === "folder" ? filesDetail(r) : query.trim() && parentOf(r.path)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function MentionList({
  options,
  active,
  query,
  onPick,
}: {
  options: Reference[];
  active: number;
  query: string;
  onPick: (ref: Reference) => void;
}) {
  return (
    <div className="bg-popover text-popover-foreground absolute inset-x-2 bottom-full z-10 mb-1 rounded-md border p-1 shadow-md">
      {options.length === 0 ? (
        <p className="text-muted-foreground px-2 py-1.5 text-sm">
          Nothing in your folder is called “{query}”.
        </p>
      ) : (
        // A listbox the textarea drives (aria-activedescendant), so not a <select>.
        <div id="mention-list" role="listbox" aria-label="Files and folders">
          {options.map((r, i) => (
            <div
              key={r.path}
              id={`mention-${i}`}
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              // Keeps the focus in the input.
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(r);
              }}
              className={cn(
                "flex min-w-0 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                i === active && "bg-accent text-accent-foreground",
              )}
            >
              {r.kind === "folder" ? (
                <Folder className="size-4 shrink-0" />
              ) : (
                <FileText className="size-4 shrink-0" />
              )}
              <span className="truncate">{chipLabel(r)}</span>
              <span className="text-muted-foreground ml-auto shrink-0 truncate text-xs">
                {r.kind === "folder" ? filesDetail(r) : parentOf(r.path) || "Your folder"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- The composer --------------------------------------------------------

export interface ComposerProps {
  variant?: ComposerVariant;
  outbox: FlueOutbox;
  onStop: () => void;
  initialText?: string;
  /** Chips already above the input (A), or mentions already in `initialText` (B). */
  initialRefs?: Reference[];
  initialNotice?: Notice;
  ref?: Ref<ComposerHandle>;
}

export function Composer({
  variant = "A",
  outbox,
  onStop,
  initialText = "",
  initialRefs = [],
  initialNotice,
  ref,
}: ComposerProps) {
  const running = useAuiState((s) => s.thread.isRunning);
  const input = useRef<HTMLTextAreaElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialText);
  const [caret, setCaret] = useState(initialText.length);
  const [moveCaret, setMoveCaret] = useState<number>();
  const [refs, setRefs] = useState<Reference[]>(variant === "A" ? initialRefs : []);
  /** Variant B: mentions picked; one counts while its token is in the text. */
  const [mentions, setMentions] = useState<Reference[]>(variant === "B" ? initialRefs : []);
  const [files, setFiles] = useState<DeliveredAttachment[]>([]);
  const [notices, setNotices] = useState<Notice[]>(initialNotice ? [initialNotice] : []);
  const [dismissedAt, setDismissedAt] = useState<number>();
  const [active, setActive] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    if (moveCaret === undefined) return;
    input.current?.focus();
    input.current?.setSelectionRange(moveCaret, moveCaret);
    setMoveCaret(undefined);
  }, [moveCaret]);

  const tokens = mentions.map(token);
  const found = findMention(text, caret, tokens);
  const options = found ? matchReferences(found.query) : [];
  // A query with a space and no match is ordinary text, not a mention.
  const mention =
    found && found.start !== dismissedAt && (options.length > 0 || !/\s/.test(found.query))
      ? found
      : undefined;

  const addRef = (ref: Reference) =>
    setRefs((rs) => (rs.some((r) => r.path === ref.path) ? rs : [...rs, ref]));

  const update = (next: string, at: number) => {
    setText(next);
    setCaret(at);
    setActive(0);
  };

  const insertToken = (ref: Reference, from: number, to: number, gap = "") => {
    const t = `${gap}${token(ref)} `;
    update(text.slice(0, from) + t + text.slice(to), from + t.length);
    setMoveCaret(from + t.length);
    setMentions((ms) => [...ms, ref]);
  };

  const pick = (ref: Reference) => {
    if (!mention) return;
    const end = mention.start + 1 + mention.query.length;
    if (variant === "B") return insertToken(ref, mention.start, end);
    const name = chipLabel(ref);
    update(text.slice(0, mention.start) + name + text.slice(end), mention.start + name.length);
    setMoveCaret(mention.start + name.length);
    addRef(ref);
  };

  const addFromFolder = (ref: Reference) => {
    if (variant === "A") return addRef(ref);
    // Variant B: appended after whatever was typed.
    insertToken(ref, text.length, text.length, text && !/\s$/.test(text) ? " " : "");
  };

  const addFiles = async (list: File[]) => {
    for (const file of list) {
      if (!sendable(file)) {
        setNotices((ns) => [...ns, { kind: "outside", filename: file.name }]);
      } else if (file.size > MAX_BYTES) {
        setNotices((ns) => [...ns, { kind: "too-big", filename: file.name }]);
      } else {
        const data = await readBase64(file);
        const attachment: DeliveredAttachment = file.type.startsWith("image/")
          ? { type: "image", data, mimeType: file.type, filename: file.name }
          : { type: "document", data, mimeType: "application/pdf", filename: file.name };
        setFiles((fs) => [...fs, attachment]);
      }
    }
  };

  const dropPath = (path: string) => {
    const ref = findReference(path);
    if (ref) addFromFolder(ref);
  };

  useImperativeHandle(ref, () => ({ dropPath, dropFiles: (fs) => void addFiles(fs) }));

  const outgoingRefs =
    variant === "A"
      ? refs
      : mentions.filter(
          (m, i) => text.includes(token(m)) && mentions.findIndex((x) => x.path === m.path) === i,
        );
  const empty = !text.trim() && outgoingRefs.length === 0 && files.length === 0;

  const send = () => {
    if (empty) return;
    outbox.send({
      kind: "user",
      body: encodeBody(text.trim(), outgoingRefs),
      ...(files.length > 0 && { attachments: files }),
    });
    update("", 0);
    setRefs([]);
    setMentions([]);
    setFiles([]);
    setNotices([]);
    setDismissedAt(undefined);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (mention) {
      const n = options.length;
      if (e.key === "ArrowDown" && n) {
        e.preventDefault();
        return setActive((active + 1) % n);
      }
      if (e.key === "ArrowUp" && n) {
        e.preventDefault();
        return setActive((active - 1 + n) % n);
      }
      if ((e.key === "Enter" || e.key === "Tab") && n) {
        e.preventDefault();
        const picked = options[Math.min(active, n - 1)];
        return picked && pick(picked);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        return setDismissedAt(mention.start);
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const path = e.dataTransfer.getData(FOLDER_PATH_TYPE);
    if (path) dropPath(path);
    else void addFiles([...e.dataTransfer.files]);
  };

  // Variant B shows the picked mentions highlighted, through a mirror of the text.
  const pattern = tokens.length
    ? new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`)
    : undefined;
  const mirror =
    variant === "B" && pattern
      ? text.split(pattern).map((piece, i) =>
          i % 2 ? (
            <mark key={i} className="bg-primary/15 text-primary rounded-sm" data-mention>
              {piece}
            </mark>
          ) : (
            piece
          ),
        )
      : text;

  const shownRefs = variant === "A" ? refs : [];

  return (
    <section
      aria-label="Write a message"
      className="relative border-t p-2"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {mention && (
        <MentionList
          options={options}
          active={Math.min(active, Math.max(options.length - 1, 0))}
          query={mention.query}
          onPick={pick}
        />
      )}

      {notices.map((n, i) => (
        <div
          key={i}
          role="status"
          className="bg-muted mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 text-xs"
        >
          <p className="min-w-0 flex-1 basis-56">
            {n.kind === "outside" ? (
              <>
                “{n.filename}” isn't in your folder, and only photos and PDFs can be sent from your
                computer. Add it to your folder first, so the assistant can read it.
              </>
            ) : (
              <>
                “{n.filename}” is too large to send (14 MB at most). Add it to your folder instead.
              </>
            )}
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                // Prototype: the copy lands at the top of the folder.
                addFromFolder({ kind: "file", path: n.filename });
                setNotices((ns) => ns.filter((x) => x !== n));
              }}
            >
              Add to folder
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Dismiss"
              onClick={() => setNotices((ns) => ns.filter((x) => x !== n))}
            >
              <X />
            </Button>
          </div>
        </div>
      ))}

      <div className="bg-background focus-within:ring-ring/50 rounded-xl border focus-within:ring-2">
        {(shownRefs.length > 0 || files.length > 0) && (
          <ul aria-label="Context" className="flex flex-wrap gap-1 px-2 pt-2">
            {shownRefs.map((r) => (
              <li key={r.path} className="max-w-full">
                <RefChip
                  refer={r}
                  onRemove={() => setRefs((rs) => rs.filter((x) => x.path !== r.path))}
                />
              </li>
            ))}
            {files.map((f, i) => (
              <li key={`${f.filename}-${i}`} className="max-w-full">
                <AttachmentChip
                  file={f}
                  onRemove={() => setFiles((fs) => fs.filter((x) => x !== f))}
                />
              </li>
            ))}
          </ul>
        )}

        {/* The textarea grows with its mirror: both sit in one grid cell. */}
        <div className="grid max-h-40 overflow-y-auto text-sm [&>*]:col-start-1 [&>*]:row-start-1">
          <div
            aria-hidden
            className={cn(
              "pointer-events-none px-3 py-2 break-words whitespace-pre-wrap",
              variant === "A" && "invisible",
            )}
          >
            {mirror}
            {"\u200b"}
          </div>
          <textarea
            ref={input}
            aria-label="Message"
            // A combobox while the @ list is open: arrows move in the list.
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={mention ? true : undefined}
            aria-controls={mention ? "mention-list" : undefined}
            aria-activedescendant={mention && options.length ? `mention-${active}` : undefined}
            rows={1}
            value={text}
            placeholder={
              variant === "A" ? "Ask about your files…" : "Ask about your files — @ to add one…"
            }
            onChange={(e) =>
              update(e.target.value, e.target.selectionStart ?? e.target.value.length)
            }
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            className={cn(
              "placeholder:text-muted-foreground resize-none overflow-hidden bg-transparent px-3 py-2 break-words focus:outline-none",
              variant === "B" && "caret-foreground text-transparent",
            )}
          />
        </div>

        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          {variant === "A" ? (
            <div className="relative">
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground h-8"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <Paperclip /> Attach
              </Button>
              {menuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close menu"
                    tabIndex={-1}
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="bg-popover text-popover-foreground absolute bottom-full left-0 z-20 mb-1 w-56 rounded-md border p-1 shadow-md"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                      onClick={() => {
                        setMenuOpen(false);
                        setPickerOpen(true);
                      }}
                    >
                      <Folder className="size-4" /> From your folder
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                      onClick={() => {
                        setMenuOpen(false);
                        filePicker.current?.click();
                      }}
                    >
                      <HardDrive className="size-4" />
                      <span>
                        From this computer
                        <span className="text-muted-foreground block text-xs">Photos and PDFs</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground size-8"
              aria-label="Add a photo or PDF from this computer"
              onClick={() => filePicker.current?.click()}
            >
              <Plus />
            </Button>
          )}
          <span className="flex-1" />
          {running && (
            <Button
              size="icon"
              variant="outline"
              className="size-8"
              aria-label="Stop"
              onClick={onStop}
            >
              <Square />
            </Button>
          )}
          <Button
            size="icon"
            className="size-8"
            aria-label="Send"
            title={running ? "Send after the current answer" : "Send"}
            disabled={empty}
            onClick={send}
          >
            <SendHorizontal />
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground mt-1 px-1 text-[11px]">
        Enter to send · Shift+Enter for a new line · @ to add a file from your folder
      </p>

      <input
        ref={filePicker}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void addFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <FolderPicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={addRef} />

      {dragging && (
        <div className="bg-background/90 border-primary pointer-events-none absolute inset-1 flex items-center justify-center rounded-xl border-2 border-dashed text-sm font-medium">
          Drop to add to your message
        </div>
      )}
    </section>
  );
}

// --- The scripted assistant ----------------------------------------------

/** The `read` tool: the assistant reading a referenced file in the browser. */
export const ReadToolUI: ToolCallMessagePartComponent<{ path: string }> = ({ args, result }) => (
  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
    <FileSearch className="size-3.5 shrink-0" /> {result === undefined ? "Reading" : "Read"}{" "}
    {args.path}
  </p>
);

const ANSWER =
  "Short version: the Dupont offer covers the kitchen and the floor in two phases, and the notes still list the start date as unconfirmed with Mr Dupont. Do you want me to draft the email asking him to confirm it?";

/** Reads every referenced file, then answers in a few streamed chunks. */
export const composerAgent: ScriptedAgent = (message) => {
  const { refs } = decodeBody(message.body);
  const files = message.kind === "user" ? (message.attachments ?? []) : [];
  const calls = refs.map(
    (r, i) =>
      ({
        type: "dynamic-tool",
        toolName: "read",
        toolCallId: `read_${Date.now()}_${i}`,
        input: { path: r.kind === "folder" ? `${r.path}/` : r.path },
      }) as const,
  );
  const read: FlueConversationPart[] = calls.map((c) => ({
    ...c,
    state: "output-available",
    output: "ok",
  }));
  const intro = [
    refs.length ? `I read ${refs.map(chipLabel).join(", ")}.` : "",
    files.length ? `I looked at ${files.map((f) => f.filename).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const words = `${intro ? `${intro} ` : ""}${ANSWER}`.split(" ");
  const steps: FlueConversationPart[][] = [];
  if (calls.length)
    steps.push(calls.map((c) => ({ ...c, state: "input-available", input: c.input })));
  const chunk = Math.ceil(words.length / 6);
  for (let end = chunk; end < words.length + chunk; end += chunk) {
    steps.push([
      ...read,
      {
        type: "text",
        text: words.slice(0, end).join(" "),
        state: end >= words.length ? "done" : "streaming",
      },
    ]);
  }
  return steps;
};

// --- The prototype: a chat around the composer ----------------------------

const PHOTO =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAZklEQVR4nA3JoRVEMQhFwV/dLYcCKIACECs50U9Ho9HRKWYzdr6fsQwZ22hjjGNc4/s5y5GznXbGOc71F8EKFOyggwlOcONFshIlO+lkkpPcfFGsQsUuupjiFLdeiCUktmgx4ogr/gh5ShGb3D3UAAAAAElFTkSuQmCC";

const photoFile = () =>
  new File([Uint8Array.from(atob(PHOTO), (c) => c.charCodeAt(0))], "site-photo.png", {
    type: "image/png",
  });

/** A conversation whose last answer was stopped half-way. */
function stoppedHistory(question: string) {
  const submissionId = "sub_past_stopped";
  const cut = ANSWER.split(" ").slice(0, 14).join(" ");
  const messages: FlueConversationMessage[] = [
    {
      id: "past_user",
      role: "user",
      purpose: "user",
      display: "visible",
      submissionId,
      parts: [{ type: "text", text: question, state: "done" }],
    },
    {
      id: "past_reply",
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      submissionId,
      parts: [{ type: "text", text: cut, state: "done" }],
    },
  ];
  return { messages, settlements: [{ submissionId, outcome: "aborted" as const }] };
}

export interface ComposerChatProps {
  variant?: ComposerVariant;
  /** Milliseconds between steps of the scripted assistant. */
  delay?: number;
  /** Whether the Sandclaw machine answers as the story opens. */
  online?: boolean;
  /** Resend failed messages by themselves once the machine is back. */
  autoRetry?: boolean;
  /** Sent as the story opens. */
  startWith?: string;
  /** Sent as the story opens, after `startWith`: queued, or failed when offline. */
  thenSend?: string;
  /** Opens on an answer that was stopped half-way, to this question. */
  stoppedAfter?: string;
  initialText?: string;
  initialRefs?: Reference[];
  initialNotice?: Notice;
}

/** The composer in a chat, with prototype controls to drop files and cut the machine. */
export function ComposerChat({
  variant = "A",
  delay = 600,
  online = true,
  autoRetry = false,
  startWith,
  thenSend,
  stoppedAfter,
  initialText,
  initialRefs,
  initialNotice,
}: ComposerChatProps) {
  const [{ session, outbox }] = useState(() => {
    const session = createMockFlueSession({
      agent: composerAgent,
      delay,
      online,
      initial: stoppedAfter ? stoppedHistory(stoppedAfter) : undefined,
    });
    const outbox = createFlueOutbox(session, { autoRetry });
    if (startWith) outbox.send({ kind: "user", body: startWith });
    if (thenSend) outbox.send({ kind: "user", body: thenSend });
    return { session, outbox };
  });
  const machineOnline = useSyncExternalStore(session.subscribe, session.isOnline);
  const pending = useFlueOutbox(outbox);
  const composer = useRef<ComposerHandle>(null);
  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <Card className="h-[600px] max-h-[85svh] w-full gap-0 overflow-hidden p-0">
        <FlueThread
          session={session}
          tools={{ read: ReadToolUI }}
          UserText={ReferenceText}
          empty={
            pending.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Ask about your files. Add a file or a folder so the assistant reads it first.
              </p>
            )
          }
          afterMessages={<PendingMessages outbox={outbox} autoRetry={autoRetry} />}
          composer={
            <Composer
              ref={composer}
              variant={variant}
              outbox={outbox}
              onStop={() => session.abort()}
              initialText={initialText}
              initialRefs={initialRefs}
              initialNotice={initialNotice}
            />
          }
        />
      </Card>
      <fieldset className="text-muted-foreground flex flex-wrap gap-2 rounded-md border border-dashed p-2 text-xs">
        <legend className="px-1">Prototype controls</legend>
        <Button
          size="sm"
          variant="outline"
          className="h-auto py-1 text-xs whitespace-normal"
          onClick={() => composer.current?.dropPath("Clients/Leroy — brief.pdf")}
        >
          Drag “Leroy — brief.pdf” from the folder
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-auto py-1 text-xs whitespace-normal"
          onClick={() => composer.current?.dropFiles([photoFile()])}
        >
          Drop a photo from the computer
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-auto py-1 text-xs whitespace-normal"
          onClick={() =>
            composer.current?.dropFiles([
              new File(["budget"], "budget.xlsx", {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              }),
            ])
          }
        >
          Drop “budget.xlsx” from the computer
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-auto py-1 text-xs whitespace-normal"
          onClick={() => session.setOnline(!machineOnline)}
        >
          {machineOnline ? "Take the Sandclaw machine offline" : "Bring the Sandclaw machine back"}
        </Button>
      </fieldset>
    </div>
  );
}
