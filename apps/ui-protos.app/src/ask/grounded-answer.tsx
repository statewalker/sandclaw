import {
  type TextMessagePartComponent,
  type ToolCallMessagePartComponent,
  useAuiState,
} from "@assistant-ui/react";
import {
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@statewalker/ui.view.shadcn";
import {
  ChevronRight,
  CircleHelp,
  ExternalLink,
  FileText,
  Loader2,
  Search,
  SearchX,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { FlueConversationMessage, FlueConversationPart } from "../chat/flue.js";
import { createMockFlueSession, type ScriptedAgent } from "../chat/flue-runtime.js";
import { FlueThread } from "../chat/thread.js";
import { answerText, documents, findAnswer, type GroundedAnswer, type Source } from "./answers.js";

/** Where the sources sit: under the answer, or in a list beside it. */
export type AnswerLayout = "inline" | "side";
export type AnswerPhase = "searching" | "writing" | "done";

const fileName = (path: string) => path.split("/").at(-1) ?? path;
const folderOf = (path: string) => path.split("/").slice(0, -1).join("/") || "Your folder";

/** The cited document, scrolled to the passage, which is highlighted. */
function SourcePreview({ source, children }: { source: Source; children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  return (
    <Dialog onOpenChange={() => setOpened(false)}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90svh] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2 break-words">
            <FileText className="size-4 shrink-0" /> {fileName(source.path)}
          </DialogTitle>
          <DialogDescription>
            {folderOf(source.path)} · {source.section}
          </DialogDescription>
        </DialogHeader>
        <DocumentView path={source.path} blockId={source.blockId} />
        <DialogFooter className="flex-wrap items-center gap-2">
          {opened && (
            <p className="text-muted-foreground mr-auto text-xs">
              Here the file would open in your folder.
            </p>
          )}
          <Button variant="outline" onClick={() => setOpened(true)}>
            <ExternalLink /> Open file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentView({ path, blockId }: { path: string; blockId: string }) {
  const cited = useRef<HTMLElement>(null);
  useEffect(() => {
    cited.current?.scrollIntoView?.({ block: "center" });
  }, []);
  return (
    <div className="bg-muted/40 min-h-0 overflow-y-auto rounded-md border p-3 text-sm">
      {(documents[path] ?? []).map((b) => (
        <div key={b.blockId} className="mb-3 last:mb-0">
          {b.heading && <h3 className="mb-1 font-semibold">{b.heading}</h3>}
          {b.blockId === blockId ? (
            <mark
              ref={cited}
              data-testid="cited-passage"
              className="block rounded bg-yellow-200/80 px-1 whitespace-pre-wrap text-inherit dark:bg-yellow-500/30"
            >
              {b.text}
            </mark>
          ) : (
            <p className="whitespace-pre-wrap">{b.text}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** A citation marker: [n] in the answer, opening the cited passage. */
export function Citation({ source }: { source: Source }) {
  return (
    <SourcePreview source={source}>
      <button
        type="button"
        aria-label={`Source ${source.n}`}
        className="bg-secondary hover:bg-primary hover:text-primary-foreground mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 align-super text-[10px] font-medium"
      >
        {source.n}
      </button>
    </SourcePreview>
  );
}

/** A source card: number, file, folder, section, a short quote. */
export function SourceCard({ source, compact }: { source: Source; compact?: boolean }) {
  return (
    <SourcePreview source={source}>
      <button
        type="button"
        aria-label={`Open source ${source.n}, ${fileName(source.path)}`}
        className="hover:bg-muted/60 flex w-full min-w-0 gap-2 rounded-md border p-2.5 text-left text-sm"
      >
        <span className="bg-secondary flex size-5 shrink-0 items-center justify-center rounded text-xs font-medium">
          {source.n}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium">{fileName(source.path)}</span>
          <span className="text-muted-foreground truncate text-xs">
            {folderOf(source.path)} · {source.section}
          </span>
          {!compact && (
            <span className="text-muted-foreground line-clamp-2 text-xs italic">
              “{source.snippet}”
            </span>
          )}
        </span>
      </button>
    </SourcePreview>
  );
}

function Sources({ sources, compact }: { sources: Source[]; compact?: boolean }) {
  return (
    <ul aria-label="Sources" className="flex flex-col gap-2">
      {sources.map((s) => (
        <li key={s.n}>
          <SourceCard source={s} compact={compact} />
        </li>
      ))}
    </ul>
  );
}

/** The answer's sentences, each with its citations; an unsupported one says so. */
function AnswerBody({ answer, written }: { answer: GroundedAnswer; written: number }) {
  const byN = new Map(answer.sources.map((s) => [s.n, s]));
  return (
    <p className="leading-relaxed">
      {answer.segments.slice(0, written).map((s) =>
        "cites" in s ? (
          <span key={s.text}>
            {s.text}
            {s.cites.map((n) => {
              const source = byN.get(n);
              return source && <Citation key={n} source={source} />;
            })}{" "}
          </span>
        ) : (
          <span key={s.text} className="text-muted-foreground inline-flex items-baseline gap-1">
            <CircleHelp className="size-3.5 shrink-0 self-center" /> {s.text}{" "}
          </span>
        ),
      )}
      {written < answer.segments.length && (
        <span className="bg-foreground ml-0.5 inline-block h-4 w-1.5 animate-pulse align-middle" />
      )}
    </p>
  );
}

function NotFound({ answer }: { answer: GroundedAnswer }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 font-medium">
        <SearchX className="size-4 shrink-0" /> I didn't find this in your files.
      </p>
      <div className="text-muted-foreground text-sm">
        I looked for{" "}
        {answer.searched.map((q, i) => (
          <span key={q}>
            {i > 0 && (i === answer.searched.length - 1 ? " and " : ", ")}“{q}”
          </span>
        ))}{" "}
        in every file of your folder.
      </div>
      <ul className="text-muted-foreground list-disc pl-5 text-sm">
        <li>Rephrase the question, with the client's name or the kind of document.</li>
        <li>Check that the folder holding this information is indexed.</li>
      </ul>
    </div>
  );
}

function FollowUps({ items, onPick }: { items: string[]; onPick?: (q: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((q) => (
        <Button
          key={q}
          size="sm"
          variant="outline"
          className="h-auto py-1 whitespace-normal"
          onClick={() => onPick?.(q)}
        >
          {q}
        </Button>
      ))}
    </div>
  );
}

const Working = ({ children }: { children: ReactNode }) => (
  <p className="text-muted-foreground flex items-center gap-2 text-sm" aria-live="polite">
    <Loader2 className="size-4 animate-spin" /> {children}
  </p>
);

export interface GroundedAnswerViewProps {
  answer: GroundedAnswer;
  layout?: AnswerLayout;
  phase?: AnswerPhase;
  /** While writing: how many sentences are written. */
  written?: number;
  onFollowUp?: (question: string) => void;
}

export function GroundedAnswerView({
  answer,
  layout = "inline",
  phase = "done",
  written = answer.segments.length,
  onFollowUp,
}: GroundedAnswerViewProps) {
  if (phase === "searching") return <Working>Searching your files…</Working>;
  if (answer.status === "not-found")
    return (
      <div className="flex flex-col gap-4">
        <NotFound answer={answer} />
        <FollowUps items={answer.followUps} onPick={onFollowUp} />
      </div>
    );
  const shown = phase === "writing" ? written : answer.segments.length;
  const body = (
    <div className="flex min-w-0 flex-col gap-3">
      {phase === "writing" && <Working>Writing the answer…</Working>}
      <AnswerBody answer={answer} written={shown} />
    </div>
  );
  const heading = (
    <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Sources</h3>
  );
  return (
    <div className="flex flex-col gap-4">
      {layout === "inline" ? (
        <>
          {body}
          <section className="flex flex-col gap-2">
            {heading}
            <Sources sources={answer.sources} />
          </section>
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
          {body}
          <aside className="flex min-w-0 flex-col gap-2 md:border-l md:pl-4">
            {heading}
            <Sources sources={answer.sources} compact />
          </aside>
        </div>
      )}
      {phase === "done" && <FollowUps items={answer.followUps} onPick={onFollowUp} />}
    </div>
  );
}

export interface AskPanelProps {
  question: string;
  layout?: AnswerLayout;
  /** Milliseconds per step of the scripted answer. */
  delay?: number;
  /** Hold one phase still, for a static story. */
  freeze?: AnswerPhase;
}

/** One question and its answer, played as searching → writing → done. */
export function AskPanel({
  question: initial,
  layout = "inline",
  delay = 700,
  freeze,
}: AskPanelProps) {
  const [question, setQuestion] = useState(initial);
  const answer = findAnswer(question);
  const [phase, setPhase] = useState<AnswerPhase>(freeze ?? "searching");
  const [written, setWritten] = useState(freeze === "writing" ? 1 : 0);

  useEffect(() => {
    if (freeze) return;
    setPhase("searching");
    setWritten(0);
    const timers = [setTimeout(() => setPhase("writing"), delay)];
    const total = findAnswer(question).segments.length;
    for (let i = 1; i <= total; i++)
      timers.push(setTimeout(() => setWritten(i), delay + (i * delay) / 2));
    timers.push(setTimeout(() => setPhase("done"), delay + ((total + 1) * delay) / 2));
    return () => timers.forEach(clearTimeout);
  }, [question, delay, freeze]);

  return (
    <Card className="w-full max-w-3xl gap-4 p-4">
      <div className="flex min-w-0 items-start gap-2">
        <Search className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <p className="min-w-0 font-medium">{question}</p>
      </div>
      <GroundedAnswerView
        answer={answer}
        layout={layout}
        phase={phase}
        written={written}
        onFollowUp={setQuestion}
      />
    </Card>
  );
}

// --- Ask inside a chat: a tool of the Flue agent ---------------------------

/** The `ask` tool's call: "Searched your files · 3 sources", opening to the cards. */
export const AskToolUI: ToolCallMessagePartComponent<{ question: string }, GroundedAnswer> = ({
  result,
}) => {
  if (!result) return <Working>Searching your files…</Working>;
  const found = result.sources.length;
  return (
    <Collapsible className="rounded-md border">
      <CollapsibleTrigger className="group text-muted-foreground flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        Searched your files ·{" "}
        {found === 0 ? "nothing found" : `${found} source${found > 1 ? "s" : ""}`}
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-2">
        {found > 0 ? (
          <Sources sources={result.sources} />
        ) : (
          <p className="text-muted-foreground text-xs">
            Looked for {result.searched.map((q) => `“${q}”`).join(", ")}.
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

/** Assistant text whose [n] markers link to the sources of this message's `ask` call. */
export const CitedText: TextMessagePartComponent = ({ text }) => {
  const ask = useAuiState((s) =>
    s.message.parts.find((p) => p.type === "tool-call" && p.toolName === "ask"),
  );
  const sources =
    ask?.type === "tool-call" ? (ask.result as GroundedAnswer | undefined)?.sources : undefined;
  const byN = new Map((sources ?? []).map((s) => [s.n, s]));
  return (
    <p className="leading-relaxed whitespace-pre-wrap">
      {text.split(/(\[\d+\])/).map((piece, i) => {
        const source = byN.get(Number(piece.slice(1, -1)));
        return source && /^\[\d+\]$/.test(piece) ? (
          <Citation key={`${i}-${piece}`} source={source} />
        ) : (
          piece
        );
      })}
    </p>
  );
};

const askCall = (question: string, id: string) =>
  ({ type: "dynamic-tool", toolName: "ask", toolCallId: id, input: { question } }) as const;

/** The scripted agent: calls `ask`, then writes the answer with the same markers. */
export const askAgent: ScriptedAgent = (message) => {
  const answer = findAnswer(message.body);
  const call = askCall(message.body, `call_${Date.now()}`);
  const done: FlueConversationPart = { ...call, state: "output-available", output: answer };
  const words = answerText(answer).split(" ");
  const chunk = Math.ceil(words.length / 4);
  const steps: FlueConversationPart[][] = [[{ ...call, state: "input-available" }], [done]];
  for (let end = chunk; end < words.length + chunk; end += chunk) {
    const last = end >= words.length;
    steps.push([
      done,
      { type: "text", text: words.slice(0, end).join(" "), state: last ? "done" : "streaming" },
    ]);
  }
  return steps;
};

/** A conversation that already happened: each question asked and answered. */
function history(questions: string[]) {
  const messages: FlueConversationMessage[] = [];
  questions.forEach((question, i) => {
    const submissionId = `sub_past_${i}`;
    const answer = findAnswer(question);
    messages.push(
      {
        id: `past_user_${i}`,
        role: "user",
        purpose: "user",
        display: "visible",
        submissionId,
        parts: [{ type: "text", text: question, state: "done" }],
      },
      {
        // Runtime plumbing: in the transcript, never in the thread.
        id: `past_dispatch_${i}`,
        role: "system",
        purpose: "dispatch",
        display: "hidden",
        submissionId,
        parts: [{ type: "text", text: "folder context attached", state: "done" }],
      },
      {
        id: `past_reply_${i}`,
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId,
        parts: [
          { ...askCall(question, `past_call_${i}`), state: "output-available", output: answer },
          { type: "text", text: answerText(answer), state: "done" },
        ],
      },
    );
  });
  const settlements = questions.map((_, i) => ({
    submissionId: `sub_past_${i}`,
    outcome: "completed" as const,
  }));
  return { messages, settlements };
}

export interface AskChatProps {
  /** Questions already asked and answered. */
  history?: string[];
  /** A question sent as the story opens. */
  startWith?: string;
  /** Milliseconds between steps of the scripted agent. */
  delay?: number;
}

/** A chat whose agent answers through the `ask` tool. */
export function AskChat({ history: past = [], startWith, delay = 600 }: AskChatProps) {
  const [session] = useState(() => {
    const s = createMockFlueSession({ agent: askAgent, delay, initial: history(past) });
    if (startWith) s.send({ kind: "user", body: startWith });
    return s;
  });
  return (
    <Card className="h-[600px] max-h-[90svh] w-full max-w-xl gap-0 overflow-hidden p-0">
      <FlueThread
        session={session}
        tools={{ ask: AskToolUI }}
        Text={CitedText}
        empty={<p className="text-muted-foreground text-sm">Ask anything about your files.</p>}
      />
    </Card>
  );
}
