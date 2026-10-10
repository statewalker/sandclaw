import { Button, cn } from "@statewalker/ui.view.shadcn";
import { Check, CloudOff, FileWarning, Loader2, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { setDone } from "../notes-todos/todos.js";
import { notePath, noteText } from "./files.js";
import { type Block, lineOffset, parseMarkdown, replaceLines } from "./markdown.js";
import { MarkdownBlock, MarkdownView } from "./markdown-view.js";
import { ViewerFrame } from "./viewers.js";

/**
 * How a note is edited:
 * - `modes`: Source | Preview | Side by side, Preview first; clicking the preview opens the
 *   source at that line;
 * - `live`: one surface, rendered; the block clicked turns into its source while you type.
 */
export type EditorVariant = "modes" | "live";
export type EditorMode = "source" | "preview" | "split";
export type SaveStatus = "saved" | "saving" | "offline" | "conflict";

export interface NoteEditorProps {
  variant?: EditorVariant;
  path?: string;
  text?: string;
  /** Variant `modes`: the mode it opens in. */
  mode?: EditorMode;
  /** The status it opens with; `saving` settles to `saved` after `saveDelay`. */
  status?: SaveStatus;
  /** The folder is disconnected: edits can't be written. */
  disconnected?: boolean;
  /** What another program wrote to the file meanwhile: the conflict shows at once. */
  theirs?: string;
  /** Opened from an answer: the question, and the cited line. */
  citation?: { question: string; line: number };
  /** Pause after the last keystroke before the note is written, in ms. */
  saveDelay?: number;
}

const modes: [EditorMode, string][] = [
  ["source", "Source"],
  ["preview", "Preview"],
  ["split", "Side by side"],
];

function StatusLabel({ status, onReconnect }: { status: SaveStatus; onReconnect: () => void }) {
  const base = "flex items-center gap-1.5 text-xs";
  switch (status) {
    case "saved":
      return (
        <span role="status" className={cn(base, "text-muted-foreground")}>
          <Check className="size-3.5" /> Saved
        </span>
      );
    case "saving":
      return (
        <span role="status" className={cn(base, "text-muted-foreground")}>
          <Loader2 className="size-3.5 animate-spin" /> Saving…
        </span>
      );
    case "conflict":
      return (
        <span role="status" className={cn(base, "text-destructive")}>
          <TriangleAlert className="size-3.5" /> Not saved
        </span>
      );
    case "offline":
      return (
        <span role="status" className={cn(base, "text-destructive flex-wrap")}>
          <CloudOff className="size-3.5" /> Not saved — the folder is disconnected
          <Button variant="outline" size="xs" onClick={onReconnect}>
            Reconnect
          </Button>
        </span>
      );
  }
}

const paneTitle = "text-muted-foreground px-3 pt-2 text-xs font-medium tracking-wide uppercase";

/** Both versions, differing lines marked, each keepable. */
function SeeBoth({
  mine,
  theirs,
  onKeep,
}: {
  mine: string;
  theirs: string;
  onKeep: (which: "mine" | "theirs") => void;
}) {
  const pane = (title: string, text: string, other: string, which: "mine" | "theirs") => {
    const otherLines = new Set(other.split("\n"));
    return (
      <section
        aria-label={title}
        className="flex min-h-0 flex-col border-b @2xl:border-r @2xl:border-b-0"
      >
        <div className="flex items-center justify-between gap-2 pr-2">
          <h3 className={paneTitle}>{title}</h3>
          <Button variant="outline" size="xs" className="mt-2" onClick={() => onKeep(which)}>
            Keep this version
          </Button>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {text.split("\n").map((l, i) => (
            <div
              key={i}
              className={cn(!otherLines.has(l) && "bg-yellow-200/80 dark:bg-yellow-500/30")}
            >
              {l || " "}
            </div>
          ))}
        </pre>
      </section>
    );
  };
  return (
    <div className="grid h-full min-h-0 grid-rows-2 @2xl:grid-cols-2 @2xl:grid-rows-1">
      {pane("Your version", mine, theirs, "mine")}
      {pane("Changed on disk", theirs, mine, "theirs")}
    </div>
  );
}

/** Variant `live`: the note rendered; the clicked block becomes its source until you leave it. */
function LiveEditor({
  text,
  onChange,
  citedLine,
}: {
  text: string;
  onChange: (text: string) => void;
  citedLine?: number;
}) {
  const [editing, setEditing] = useState<{ line: number; end: number } | null>(null);
  const lines = text.split("\n");
  const edit = (b: { line: number; end: number }) => setEditing({ line: b.line, end: b.end });
  const append = () => {
    const base = text.replace(/\n*$/, "");
    const next = `${base}\n\n`;
    onChange(next);
    const n = next.split("\n").length;
    setEditing({ line: n - 1, end: n });
  };
  const blocks = parseMarkdown(text);
  // While a block is being edited, it replaces the parsed blocks it overlaps.
  const shown: (Block | "editing")[] = editing
    ? [
        ...blocks.filter((b) => b.end <= editing.line),
        "editing",
        ...blocks.filter((b) => b.line >= editing.end),
      ]
    : blocks;
  return (
    <div className="flex flex-col gap-1 p-4 text-sm">
      {shown.map((b) =>
        b === "editing" && editing ? (
          <textarea
            key="editing"
            aria-label="Edit this part of the note"
            // biome-ignore lint/a11y/noAutofocus: the user just clicked this block to edit it.
            autoFocus
            value={lines.slice(editing.line, editing.end).join("\n")}
            onChange={(e) => {
              const value = e.target.value;
              onChange(replaceLines(text, editing.line, editing.end, value));
              setEditing({ line: editing.line, end: editing.line + value.split("\n").length });
            }}
            onBlur={() => setEditing(null)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
            className="bg-muted/50 field-sizing-content -mx-2 w-[calc(100%+1rem)] resize-none rounded-md px-2 py-1 font-mono text-[13px] leading-relaxed outline-none ring-ring/50 focus:ring-2"
          />
        ) : (
          b !== "editing" && (
            <MarkdownBlock
              key={b.line}
              block={b}
              cited={citedLine !== undefined && citedLine >= b.line && citedLine < b.end}
              onBlockClick={edit}
              onToggle={(line, done) => onChange(setDone(text, line, done))}
            />
          )
        ),
      )}
      <button
        type="button"
        onClick={append}
        className="text-muted-foreground hover:bg-muted/60 -mx-2 rounded-md px-2 py-3 text-left text-sm"
      >
        Click to write…
      </button>
    </div>
  );
}

/** A Markdown note opened in a tab: edited, autosaved, and safe against changes on disk. */
export function NoteEditor({
  variant = "modes",
  path = notePath,
  text: initialText = noteText,
  mode: initialMode = "preview",
  status: initialStatus = "saved",
  disconnected = false,
  theirs: initialTheirs,
  citation: initialCitation,
  saveDelay = 800,
}: NoteEditorProps) {
  const [text, setText] = useState(initialText);
  const [mode, setMode] = useState(initialMode);
  const [connected, setConnected] = useState(!disconnected);
  const [theirs, setTheirs] = useState(initialTheirs);
  const [seeBoth, setSeeBoth] = useState(false);
  const [citation, setCitation] = useState(initialCitation);
  const [status, setStatus] = useState<SaveStatus>(
    initialTheirs !== undefined ? "conflict" : disconnected ? "offline" : initialStatus,
  );
  const source = useRef<HTMLTextAreaElement>(null);
  const [caretLine, setCaretLine] = useState<number | null>(null);

  // Autosave: written once typing pauses for `saveDelay`.
  useEffect(() => {
    if (status !== "saving") return;
    const t = setTimeout(() => setStatus("saved"), saveDelay);
    return () => clearTimeout(t);
  }, [status, saveDelay]);

  // Click-to-edit: the source opens with the caret on the clicked line.
  useEffect(() => {
    if (caretLine === null || !source.current) return;
    const at = lineOffset(source.current.value, caretLine);
    source.current.focus();
    source.current.setSelectionRange(at, at);
    setCaretLine(null);
  }, [caretLine]);

  const edit = (next: string) => {
    setText(next);
    if (status !== "conflict") setStatus(connected ? "saving" : "offline");
  };
  const toggle = (line: number, done: boolean) => edit(setDone(text, line, done));
  const resolve = (which: "mine" | "theirs") => {
    if (which === "theirs" && theirs !== undefined) {
      setText(theirs);
      setStatus("saved");
    } else setStatus(connected ? "saving" : "offline");
    setTheirs(undefined);
    setSeeBoth(false);
  };

  const sourceView = (
    <textarea
      ref={source}
      aria-label="Note source"
      value={text}
      onChange={(e) => edit(e.target.value)}
      spellCheck
      className="h-full w-full resize-none bg-transparent p-4 font-mono text-[13px] leading-relaxed outline-none"
    />
  );
  const preview = (clickToEdit: boolean) => (
    <div className="h-full overflow-y-auto p-4">
      <MarkdownView
        source={text}
        citedLine={citation?.line}
        onToggle={toggle}
        onBlockClick={
          clickToEdit
            ? (b) => {
                setMode("source");
                setCaretLine(b.line);
              }
            : undefined
        }
      />
    </div>
  );

  let body: ReactNode;
  if (seeBoth && theirs !== undefined)
    body = <SeeBoth mine={text} theirs={theirs} onKeep={resolve} />;
  else if (variant === "live")
    body = (
      <div className="h-full overflow-y-auto">
        <LiveEditor text={text} onChange={edit} citedLine={citation?.line} />
      </div>
    );
  else if (mode === "source") body = sourceView;
  else if (mode === "preview") body = preview(true);
  else
    body = (
      <div className="grid h-full grid-rows-2 @2xl:grid-cols-2 @2xl:grid-rows-1">
        <div className="min-h-0 border-b @2xl:border-r @2xl:border-b-0">{sourceView}</div>
        <div className="min-h-0">{preview(false)}</div>
      </div>
    );

  return (
    <ViewerFrame
      path={path}
      icon="md"
      status={
        <StatusLabel
          status={status}
          onReconnect={() => {
            setConnected(true);
            setStatus("saving");
          }}
        />
      }
      citation={citation}
      onCloseCitation={() => setCitation(undefined)}
      banner={
        theirs !== undefined && (
          <div className="bg-destructive/10 flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
            <FileWarning className="text-destructive size-4 shrink-0" />
            <p className="min-w-48 flex-1">
              Another program changed this note while you were editing it.
            </p>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" onClick={() => resolve("mine")}>
                Keep mine
              </Button>
              <Button size="sm" variant="outline" onClick={() => resolve("theirs")}>
                Take theirs
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-pressed={seeBoth}
                onClick={() => setSeeBoth(!seeBoth)}
              >
                See both
              </Button>
            </div>
          </div>
        )
      }
      toolbar={
        variant === "modes" &&
        !seeBoth && (
          <fieldset aria-label="View" className="bg-muted flex rounded-md p-0.5">
            {modes.map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-sm px-2.5 py-1 text-xs",
                  mode === m ? "bg-background font-medium shadow-xs" : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </fieldset>
        )
      }
    >
      {body}
    </ViewerFrame>
  );
}
