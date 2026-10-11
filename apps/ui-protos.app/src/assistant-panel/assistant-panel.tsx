import { Button, cn, Input, ScrollArea } from "@statewalker/ui.view.shadcn";
import {
  CircleCheck,
  CircleX,
  FilePen,
  FilePlus,
  Loader2,
  Mail,
  NotebookPen,
  RotateCcw,
  SendHorizontal,
  ShieldCheck,
  Square,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  type Approval,
  type Consent,
  type Request,
  type ScenarioId,
  type ScriptEvent,
  type StepState,
  scenarios,
} from "./script.js";

type Answer = "once" | "task" | "allow" | "deny";

interface TaskItem {
  kind: "task";
  title: string;
  steps: { label: string; state: StepState }[];
  outputs: { file: string; change: "created" | "changed" }[];
  finished: boolean;
  note?: string;
}

type Item =
  | { kind: "user"; text: string }
  | { kind: "say"; text: string }
  | TaskItem
  | { kind: "request"; request: Request; answer?: Answer };

/**
 * Where a pending approval or consent request is shown:
 * - `inline`: as a card in the conversation, where it happened;
 * - `pinned`: above the message box, where the user's attention already is;
 *   once answered it leaves a one-line record in the conversation.
 */
export type RequestPlacement = "inline" | "pinned";

/** Applies one script event to the conversation. */
function apply(items: Item[], ev: ScriptEvent): Item[] {
  const task = items.findLast((i): i is TaskItem => i.kind === "task");
  const updateTask = (patch: (t: TaskItem) => TaskItem) =>
    items.map((i) => (i === task ? patch(i) : i));
  switch (ev.kind) {
    case "user":
    case "say":
      return [...items, { kind: ev.kind, text: ev.text }];
    case "task":
      return [...items, { kind: "task", title: ev.title, steps: [], outputs: [], finished: false }];
    case "step":
      return updateTask((t) => ({
        ...t,
        steps: [...t.steps, { label: ev.label, state: ev.state }],
      }));
    case "output":
      return updateTask((t) => ({
        ...t,
        outputs: [...t.outputs, { file: ev.file, change: ev.change }],
      }));
    case "finish":
      return updateTask((t) => ({ ...t, finished: true, note: ev.note }));
    case "ask":
      return [...items, { kind: "request", request: ev.request }];
  }
}

function TaskCard({ task }: { task: TaskItem }) {
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {task.finished ? (
          <CircleCheck className="text-success size-4" />
        ) : (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        )}
        {task.title}
      </div>
      <ul className="grid gap-1">
        {task.steps.map((s) => (
          <li key={s.label} className="text-muted-foreground flex items-center gap-2 text-xs">
            {s.state === "failed" ? (
              <CircleX className="text-destructive size-3.5" />
            ) : (
              <CircleCheck className="size-3.5" />
            )}
            {s.label}
          </li>
        ))}
        {!task.finished && (
          <li className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3.5 animate-spin" /> Working…
          </li>
        )}
      </ul>
      {task.outputs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {task.outputs.map((o) => (
            <button
              key={o.file}
              type="button"
              className="bg-secondary hover:bg-accent flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
              title={o.change === "created" ? "New file — open it" : "Changed file — open it"}
            >
              {o.change === "created" ? (
                <FilePlus className="size-3.5" />
              ) : (
                <FilePen className="size-3.5" />
              )}
              {o.file}
            </button>
          ))}
        </div>
      )}
      {task.note && <p className="text-muted-foreground text-xs">{task.note}</p>}
    </div>
  );
}

function ApprovalBody({ request }: { request: Approval }) {
  return (
    <>
      <div className="flex items-center gap-2 text-sm font-medium">
        <FilePen className="text-warning size-4" /> Change {request.file}?
      </div>
      <p className="text-muted-foreground text-xs">{request.summary}</p>
      {/* A preview of the file after the change, not a diff: added lines are marked,
          removed lines struck through, and Markdown checkboxes drawn as checkboxes. */}
      <ul className="bg-muted grid gap-0.5 rounded-md p-2 text-xs">
        {request.diff.map((line) => {
          const text = line.slice(2).replace(/^- \[ \] /, "");
          const checkbox = line.slice(2).startsWith("- [ ] ");
          return (
            <li
              key={line}
              className={cn(
                "flex items-start gap-1.5 rounded px-1.5 py-0.5",
                line.startsWith("+") && "bg-success/15",
                line.startsWith("-") && "text-muted-foreground line-through",
              )}
            >
              {checkbox && <Square className="mt-px size-3.5 shrink-0" />}
              <span>{text}</span>
              {line.startsWith("+") && (
                <span className="text-success ml-auto shrink-0 font-medium">new</span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ConsentBody({ request }: { request: Consent }) {
  return (
    <>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Mail className="size-4" /> Use {request.connector} {request.purpose}?
      </div>
      <p className="text-muted-foreground flex gap-2 text-xs">
        <ShieldCheck className="size-3.5 shrink-0" /> {request.access} You can turn it off in
        Settings.
      </p>
    </>
  );
}

function RequestCard({
  request,
  onAnswer,
}: {
  request: Request;
  onAnswer: (answer: Answer) => void;
}) {
  return (
    <div className="border-warning/60 grid gap-2 rounded-lg border p-3">
      {request.kind === "approval" ? (
        <ApprovalBody request={request} />
      ) : (
        <ConsentBody request={request} />
      )}
      <div className="flex flex-wrap gap-2">
        {request.kind === "approval" ? (
          <>
            <Button size="sm" onClick={() => onAnswer("once")}>
              Allow
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAnswer("task")}>
              Allow for this task
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => onAnswer("allow")}>
            Allow {request.connector}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onAnswer("deny")}>
          {request.kind === "approval" ? "Don't change it" : "Not now"}
        </Button>
      </div>
    </div>
  );
}

const answered: Record<Answer, string> = {
  once: "Allowed",
  task: "Allowed for this task",
  allow: "Allowed",
  deny: "Declined",
};

function RequestRecord({ request, answer }: { request: Request; answer: Answer }) {
  const what = request.kind === "approval" ? `change ${request.file}` : `use ${request.connector}`;
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      {answer === "deny" ? <CircleX className="size-3.5" /> : <CircleCheck className="size-3.5" />}
      {answered[answer]}: {what}
    </div>
  );
}

export interface AssistantPanelProps {
  scenario: ScenarioId;
  placement?: RequestPlacement;
  /** Delay between script events, in ms. */
  stepMs?: number;
}

export function AssistantPanel({
  scenario,
  placement = "inline",
  stepMs = 600,
}: AssistantPanelProps) {
  const [queue, setQueue] = useState<ScriptEvent[]>(scenarios[scenario]);
  const [next, setNext] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [saved, setSaved] = useState("");
  const pending = items.find((i) => i.kind === "request" && !i.answer);

  useEffect(() => {
    if (pending || next >= queue.length) return;
    const ev = queue[next];
    if (!ev) return;
    const timer = setTimeout(() => {
      setItems((current) => apply(current, ev));
      setNext(next + 1);
    }, stepMs);
    return () => clearTimeout(timer);
  }, [next, queue, pending, stepMs]);

  const answer = (value: Answer) => {
    const ask = queue[next - 1];
    setItems((current) => current.map((i) => (i === pending ? { ...i, answer: value } : i)));
    if (value === "deny" && ask?.kind === "ask") setQueue([...queue.slice(0, next), ...ask.onDeny]);
  };

  const replay = () => {
    setQueue(scenarios[scenario]);
    setItems([]);
    setNext(0);
    setSaved("");
  };

  return (
    <div className="bg-background flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Assistant
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="xs"
            disabled={items.length === 0}
            onClick={() => setSaved("Notes/conversation 2026-10-07.md")}
          >
            <NotebookPen /> Save as note
          </Button>
          <Button variant="ghost" size="xs" onClick={replay} title="Prototype only">
            <RotateCcw /> Replay
          </Button>
        </div>
      </div>
      {saved && <p className="text-muted-foreground px-3 pb-1 text-xs">Saved as {saved}</p>}
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 px-3 pb-3 text-sm">
          {items.map((item, index) => {
            const key = `${item.kind}-${index}`;
            if (item.kind === "user")
              return (
                <div key={key} className="bg-muted ml-6 rounded-lg px-3 py-2">
                  {item.text}
                </div>
              );
            if (item.kind === "say") return <p key={key}>{item.text}</p>;
            if (item.kind === "task") return <TaskCard key={key} task={item} />;
            if (item.answer)
              return <RequestRecord key={key} request={item.request} answer={item.answer} />;
            return placement === "inline" ? (
              <RequestCard key={key} request={item.request} onAnswer={answer} />
            ) : null;
          })}
        </div>
      </ScrollArea>
      {placement === "pinned" && pending?.kind === "request" && (
        <div className="border-t p-3">
          <RequestCard request={pending.request} onAnswer={answer} />
        </div>
      )}
      <div className="flex gap-2 border-t p-3">
        <Input placeholder="Ask about your folder…" aria-label="Ask the assistant" />
        <Button size="icon" aria-label="Send">
          <SendHorizontal />
        </Button>
      </div>
    </div>
  );
}
