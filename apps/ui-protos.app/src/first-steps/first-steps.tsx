import { Button, Card, cn, Input, ScrollArea } from "@statewalker/ui.view.shadcn";
import { FilePlus, FileText, FolderOpen, Loader2, SendHorizontal, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { FolderZone } from "../folder-zone/folder-zone.js";
import { listFiles } from "../folder-zone/tree.js";
import { folder, group, people } from "../mock.js";
import { TodosView } from "../notes-todos/todos-view.js";
import { ZoneTitle } from "../zone-title.js";
import { suggestQuestions } from "./suggest.js";

/**
 * How the workspace shows where things are, the first time:
 * - `pointers`: one dismissible note in each zone, read in any order;
 * - `tour`: three steps, one zone at a time, Next / Skip;
 * - `none`: nothing; the zones' own titles and empty states have to do.
 */
export type Guide = "pointers" | "tour" | "none";

/**
 * While the folder is still being read:
 * - `ask-now`: the suggestions are there at once ("answers improve as I read");
 * - `wait`: they appear when reading finishes; the composer still works.
 */
export type WhileReading = "ask-now" | "wait";

export interface FirstStepsProps {
  guide?: Guide;
  whileReading?: WhileReading;
  /** The chosen folder has no files. */
  emptyFolder?: boolean;
  /** Files read when the story opens; all of them by default. */
  read?: number;
  /** Milliseconds per file read; 0 stops the clock (tests). */
  stepMs?: number;
  /** The welcome and the tips were dismissed for good on an earlier visit. */
  dismissed?: boolean;
}

type ZoneId = "folder" | "assistant" | "notes";

const FOLDER = "Atelier docs";
const member = people.find((p) => p.role === "member")?.name.split(" ")[0] ?? "";

const tips: Record<ZoneId, { title: string; text: string }> = {
  folder: {
    title: "Your folder",
    text: `${FOLDER}, on this computer. The assistant reads it, and asks before changing anything in it.`,
  },
  assistant: {
    title: "The assistant",
    text: "Ask about anything in your folder. Each answer shows the passages it comes from.",
  },
  notes: {
    title: "Your notes and todos",
    text: "Notes you save go to Notes/ in your folder. Every “- [ ]” line in them is listed here as a todo.",
  },
};
const tourSteps: ZoneId[] = ["folder", "assistant", "notes"];

function Zone({
  label,
  focused,
  className,
  children,
}: {
  label: string;
  focused: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "bg-background flex min-h-0 min-w-0 flex-col",
        focused && "ring-primary relative z-10 ring-2 ring-inset",
        className,
      )}
    >
      {children}
    </section>
  );
}

function Pointer({ zone, onDismiss }: { zone: ZoneId; onDismiss: () => void }) {
  const { title, text } = tips[zone];
  return (
    <div
      role="note"
      aria-label={title}
      className="bg-primary/5 border-primary/30 mx-3 my-2 grid gap-0.5 rounded-md border py-1.5 pr-1 pl-2.5 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{title}</span>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          aria-label={`Dismiss “${title}”`}
          onClick={onDismiss}
        >
          <X />
        </Button>
      </div>
      <p className="text-muted-foreground pr-1.5">{text}</p>
    </div>
  );
}

function TourCard({
  step,
  onNext,
  onSkip,
}: {
  step: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const zone = tourSteps[step] as ZoneId;
  const last = step === tourSteps.length - 1;
  return (
    <div
      role="dialog"
      aria-label="Where things are"
      className="bg-popover absolute inset-x-3 bottom-3 z-20 grid gap-2 rounded-lg border p-3 text-sm shadow-lg md:right-auto md:left-[16rem] md:w-80"
    >
      <span className="text-muted-foreground text-xs">
        Step {step + 1} of {tourSteps.length}
      </span>
      <span className="font-medium">{tips[zone].title}</span>
      <p className="text-muted-foreground">{tips[zone].text}</p>
      <div className="flex justify-end gap-2">
        {!last && (
          <Button size="sm" variant="ghost" onClick={onSkip}>
            Skip
          </Button>
        )}
        <Button size="sm" onClick={onNext}>
          {last ? "Done" : "Next"}
        </Button>
      </div>
    </div>
  );
}

function Progress({ read, total }: { read: number; total: number }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-muted-foreground text-xs">
        Reading your folder · {read} of {total} files
      </span>
      <div className="bg-muted h-1 overflow-hidden rounded-full">
        <div className="bg-primary h-full" style={{ width: `${(100 * read) / total}%` }} />
      </div>
    </div>
  );
}

interface Turn {
  question: string;
  /** Files read when it was asked. */
  readThen: number;
}

/** What the user sees right after choosing a folder: the workspace, empty, with a welcome. */
export function FirstSteps({
  guide = "pointers",
  whileReading = "ask-now",
  emptyFolder = false,
  read: initialRead,
  stepMs = 600,
  dismissed: initiallyDismissed = false,
}: FirstStepsProps) {
  const entries = emptyFolder ? [] : folder;
  const total = listFiles(entries).length;
  const [read, setRead] = useState(initialRead ?? total);
  const [dismissed, setDismissed] = useState(initiallyDismissed);
  const [hidden, setHidden] = useState(new Set<ZoneId>());
  const [tourStep, setTourStep] = useState<number | null>(guide === "tour" ? 0 : null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [created, setCreated] = useState(false);

  const reading = read < total;
  useEffect(() => {
    if (!reading || stepMs <= 0) return;
    const timer = setTimeout(() => setRead((r) => r + 1), stepMs);
    return () => clearTimeout(timer);
  }, [reading, stepMs]);

  const suggestions = suggestQuestions(entries);
  const ask = (question: string) => {
    if (!question.trim()) return;
    setTurns((t) => [...t, { question: question.trim(), readThen: read }]);
    setDraft("");
  };

  const showTips = !dismissed && guide === "pointers";
  const pointer = (zone: ZoneId) =>
    showTips &&
    !hidden.has(zone) && (
      <Pointer zone={zone} onDismiss={() => setHidden(new Set(hidden).add(zone))} />
    );
  const focused = (zone: ZoneId) => !dismissed && tourStep !== null && tourSteps[tourStep] === zone;

  const welcome = (
    <div className="grid gap-3 p-3 text-sm">
      <p className="font-medium">
        Welcome to {group.name}, {member}.
      </p>
      {emptyFolder ? (
        <>
          <p className="text-muted-foreground">
            {FOLDER} is empty, so there is nothing to ask about yet. Start with a note — the
            assistant reads it as soon as you save it — or choose a folder that has your files.
          </p>
          {created ? (
            <p className="bg-muted rounded-md px-3 py-2">
              Created Notes/first note.md. It opens in the middle; write anything.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setCreated(true)}>
                <FilePlus /> Write a first note
              </Button>
              <Button size="sm" variant="outline">
                <FolderOpen /> Choose another folder
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            I answer questions about the files in {FOLDER}, and show the passages I rely on.
          </p>
          {reading && <Progress read={read} total={total} />}
          {reading && whileReading === "wait" ? (
            <p className="text-muted-foreground">
              Suggested questions appear when I&apos;m done. You can ask already.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                {reading
                  ? "Ask now — answers improve as I read. For example:"
                  : `I've read all ${total} files. To start, for example:`}
              </p>
              <div className="flex flex-col items-start gap-2">
                {suggestions.map((q) => (
                  <Button
                    key={q}
                    size="sm"
                    variant="outline"
                    className="h-auto max-w-full py-1 text-left whitespace-normal"
                    onClick={() => ask(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <Button
        variant="link"
        size="sm"
        className="text-muted-foreground h-auto justify-self-start p-0 text-xs"
        onClick={() => {
          setDismissed(true);
          setTourStep(null);
        }}
      >
        Don&apos;t show this again
      </Button>
    </div>
  );

  return (
    <Card className="relative grid h-[680px] max-h-[92svh] w-full max-w-6xl grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(0,11rem)_minmax(0,8rem)] gap-0 overflow-hidden p-0 md:grid-cols-[15rem_minmax(0,1fr)_22rem] md:grid-rows-[minmax(0,1fr)_minmax(0,12rem)]">
      <Zone
        label="Folder"
        focused={focused("folder")}
        className="order-2 border-t md:order-1 md:border-t-0 md:border-r"
      >
        {pointer("folder")}
        <div className="min-h-0 flex-1">
          {emptyFolder ? (
            <>
              <ZoneTitle>{FOLDER}</ZoneTitle>
              <p className="text-muted-foreground px-3 text-sm">No files yet.</p>
            </>
          ) : (
            <FolderZone
              key={reading ? "reading" : "ready"}
              state={reading ? "indexing" : "ready"}
              indexed={read}
            />
          )}
        </div>
      </Zone>

      <Zone
        label="Open file"
        focused={false}
        className="text-muted-foreground hidden items-center justify-center gap-2 p-6 text-center text-sm md:order-2 md:row-span-2 md:flex"
      >
        <FileText className="size-6" />
        Open a file from your folder to read it here.
      </Zone>

      <Zone
        label="Assistant"
        focused={focused("assistant")}
        className="order-1 md:order-3 md:row-span-2 md:border-l"
      >
        <ZoneTitle>Assistant</ZoneTitle>
        {pointer("assistant")}
        <ScrollArea className="min-h-0 flex-1">
          {turns.length === 0 && !dismissed && welcome}
          {turns.length === 0 && dismissed && (
            <p className="text-muted-foreground p-3 text-sm">Ask about anything in {FOLDER}.</p>
          )}
          <div className="grid gap-3 px-3 pb-3 text-sm">
            {turns.map((t, i) => (
              <div key={`${i}:${t.question}`} className="grid gap-2">
                <div className="bg-muted ml-6 rounded-lg px-3 py-2">{t.question}</div>
                <p className="text-muted-foreground flex items-center gap-2">
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  {t.readThen < total
                    ? `Looking through the ${t.readThen} files I've read so far…`
                    : "Looking through your folder…"}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
        <form
          className="flex gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <Input
            placeholder="Ask about your folder…"
            aria-label="Ask the assistant"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button size="icon" type="submit" aria-label="Send">
            <SendHorizontal />
          </Button>
        </form>
      </Zone>

      <Zone
        label="Notes and todos"
        focused={focused("notes")}
        className="order-3 border-t md:order-4 md:border-r"
      >
        {pointer("notes")}
        <div className="min-h-0 flex-1 overflow-auto">
          {emptyFolder ? (
            <>
              <ZoneTitle>Todos</ZoneTitle>
              <p className="text-muted-foreground px-3 text-sm">
                No notes yet. Todos from your notes show up here.
              </p>
            </>
          ) : (
            <TodosView />
          )}
        </div>
      </Zone>

      {tourStep !== null && !dismissed && (
        <TourCard
          step={tourStep}
          onNext={() => setTourStep(tourStep + 1 < tourSteps.length ? tourStep + 1 : null)}
          onSkip={() => setTourStep(null)}
        />
      )}
    </Card>
  );
}
