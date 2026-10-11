import type { FlueConversationMessage, FlueConversationPart } from "../chat/flue.js";
import type { FlueState } from "../chat/flue-runtime.js";
import { today } from "../mock.js";

// Tasks, derived from Flue conversations. A task is the agent's work for one
// sent message (a Flue submission) whose reply carries a `data-task` part:
// - plan, current plan item, produced files: the `data-task` part, rewritten in place;
// - steps: the reply's `dynamic-tool` parts (tool name + input → output or error);
// - a pending approval: a `data-approval` part with no answering signal yet;
// - the end: the submission's settlement (completed | failed | aborted).
// Nothing is stored besides the conversation: `tasksFromConversation` is the seam.

/** A chat: its title and its materialized Flue conversation. */
export interface Chat extends FlueState {
  id: string;
  title: string;
}

/** The `data-task` part the agent writes and updates in place. */
export interface TaskData {
  title: string;
  plan: string[];
  /** 0-based index of the plan item in progress. */
  current: number;
  files: { path: string; change: "created" | "changed"; at: string }[];
  note?: string;
}

/** The `data-approval` part: asking before changing a file that already exists. */
export interface ApprovalData {
  id: string;
  file: string;
  summary: string;
  /** The file after the change: "+ added", "- removed", "  kept". */
  preview: string[];
}

/** The signal tag an approval answer is delivered with. */
export const APPROVAL_SIGNAL = "sandclaw.approval";
export type ApprovalAnswer = "once" | "task" | "deny";

export type TaskStatus = "running" | "waiting" | "done" | "failed" | "stopped";

export interface TaskStep {
  id: string;
  label: string;
  state: "running" | "done" | "failed";
  /** Why a failed step failed, in plain words. */
  reason?: string;
}

export interface ProducedFile {
  path: string;
  change: "created" | "changed";
  at: Date;
  taskId: string;
  taskTitle: string;
}

export interface TaskView {
  /** The submission id. */
  id: string;
  chatId: string;
  chatTitle: string;
  title: string;
  /** What the user asked. */
  request: string;
  status: TaskStatus;
  startedAt: Date;
  endedAt?: Date;
  plan: string[];
  /** 1-based "step n of m" over the plan. */
  stepNumber: number;
  steps: TaskStep[];
  files: ProducedFile[];
  approval?: ApprovalData;
  note?: string;
  /** Requests of the same chat waiting behind this one (cancelled with it). */
  queued: string[];
}

const verbs: Record<string, [done: string, running: string, failed: string]> = {
  readFile: ["Read", "Reading", "Couldn't read"],
  readFolder: ["Read", "Reading", "Couldn't read"],
  writeFile: ["Wrote", "Writing", "Couldn't write"],
  editFile: ["Changed", "Changing", "Couldn't change"],
  groupRows: ["Grouped rows by", "Grouping rows by", "Couldn't group rows by"],
};

function stepOf(part: Extract<FlueConversationPart, { type: "dynamic-tool" }>): TaskStep {
  const input = (part.input ?? {}) as { path?: string; by?: string };
  const what = input.path ?? input.by ?? "";
  const [done, running, failed] = verbs[part.toolName] ?? ["Did", "Doing", "Couldn't do"];
  const base = { id: part.toolCallId };
  if (part.state === "output-error")
    return { ...base, label: `${failed} ${what}`, state: "failed", reason: part.errorText };
  if (part.state === "input-available")
    return { ...base, label: `${running} ${what}…`, state: "running" };
  const count = (part.output as { count?: number } | undefined)?.count;
  const label =
    part.toolName === "readFolder" && count !== undefined
      ? `Read ${count} files in ${what}`
      : `${done} ${what}`;
  return { ...base, label, state: "done" };
}

function dataOf<T>(messages: FlueConversationMessage[], type: `data-${string}`): T | undefined {
  const part = messages.flatMap((m) => m.parts).findLast((p) => p.type === type);
  return part ? (part as { data: T }).data : undefined;
}

const textOf = (m: FlueConversationMessage | undefined) =>
  m?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";

/** The tasks of one chat, oldest first. */
export function tasksFromConversation(chat: Chat): TaskView[] {
  const settlements = new Map(chat.settlements.map((s) => [s.submissionId, s]));
  const answered = new Set(
    chat.messages
      .filter((m) => m.signal?.tagName === APPROVAL_SIGNAL)
      .map((m) => m.signal?.attributes?.id),
  );
  const unsettledRequests = chat.messages.filter(
    (m) => m.purpose === "user" && m.submissionId && !settlements.has(m.submissionId),
  );

  return chat.messages
    .filter((m) => m.purpose === "user" && m.submissionId)
    .flatMap((request): TaskView[] => {
      const id = request.submissionId as string;
      const replies = chat.messages.filter((m) => m.submissionId === id && m.role === "assistant");
      const task = dataOf<TaskData>(replies, "data-task");
      if (!task) return []; // A plain answer, not a task.
      const asked = dataOf<ApprovalData>(replies, "data-approval");
      const settlement = settlements.get(id);
      const approval = !settlement && asked && !answered.has(asked.id) ? asked : undefined;
      const status: TaskStatus = settlement
        ? { completed: "done" as const, failed: "failed" as const, aborted: "stopped" as const }[
            settlement.outcome
          ]
        : approval
          ? "waiting"
          : "running";
      return [
        {
          id,
          chatId: chat.id,
          chatTitle: chat.title,
          title: task.title,
          request: textOf(request),
          status,
          startedAt: new Date(request.timestamp ?? today),
          endedAt: settlement?.timestamp ? new Date(settlement.timestamp) : undefined,
          plan: task.plan,
          stepNumber: Math.min(task.current + 1, task.plan.length),
          steps: replies.flatMap((m) =>
            m.parts.flatMap((p) => (p.type === "dynamic-tool" ? [stepOf(p)] : [])),
          ),
          files: task.files.map((f) => ({
            ...f,
            at: new Date(f.at),
            taskId: id,
            taskTitle: task.title,
          })),
          approval,
          note: task.note,
          queued:
            status === "running" || status === "waiting"
              ? unsettledRequests.filter((m) => m.submissionId !== id).map(textOf)
              : [],
        },
      ];
    });
}

/** Files the tasks created in Outputs, newest first. */
export function outputsOf(tasks: TaskView[]): ProducedFile[] {
  return tasks
    .flatMap((t) => t.files)
    .filter((f) => f.change === "created" && f.path.startsWith("Outputs/"))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

/** The collapsed strip's one line. */
export function stripSummary(tasks: TaskView[]): {
  icon: "none" | "running" | "waiting" | "done" | "failed";
  text: string;
  waiting: number;
} {
  const waiting = tasks.filter((t) => t.status === "waiting");
  const running = tasks.filter((t) => t.status === "running");
  const first = running[0];
  if (first) {
    const more = running.length > 1 ? ` · ${running.length - 1} more running` : "";
    return {
      icon: "running",
      text: `${first.title} · step ${first.stepNumber} of ${first.plan.length}${more}`,
      waiting: waiting.length,
    };
  }
  if (waiting[0])
    return {
      icon: "waiting",
      text: `${waiting[0].title} · waiting for you`,
      waiting: waiting.length,
    };
  const ofToday = tasks.filter((t) => sameDay(t.startedAt, today));
  if (ofToday.length === 0)
    return { icon: "none", text: tasks.length ? "No tasks today" : "No tasks yet", waiting: 0 };
  const failed = ofToday.filter((t) => t.status === "failed").length;
  const count = `${ofToday.length} task${ofToday.length > 1 ? "s" : ""} today`;
  return failed
    ? { icon: "failed", text: `${count} · ${failed} failed`, waiting: 0 }
    : { icon: "done", text: `${count} · all done`, waiting: 0 };
}

// ---------------------------------------------------------------------------
// What the user does, as changes to the conversation. In the app these are
// `abort()` and `send()` on the chat's Flue client; here they are pure updates,
// plus a few lines standing in for the agent's reaction.

let seq = 0;
const nextId = () => `sub_t${++seq}`;
const at = () => today.toISOString();

const userMessage = (submissionId: string, text: string): FlueConversationMessage => ({
  id: `msg_in_${submissionId}`,
  role: "user",
  purpose: "user",
  display: "visible",
  submissionId,
  timestamp: at(),
  parts: [{ type: "text", text, state: "done" }],
});

/** `abort()`: stops the running request of the chat and every one queued behind it. */
export function abortChat(chat: Chat): Chat {
  const settled = new Set(chat.settlements.map((s) => s.submissionId));
  const stopped = [
    ...new Set(
      chat.messages.flatMap((m) =>
        m.submissionId && !settled.has(m.submissionId) ? [m.submissionId] : [],
      ),
    ),
  ];
  return {
    ...chat,
    messages: [
      ...chat.messages,
      ...stopped.map(
        (submissionId): FlueConversationMessage => ({
          id: `msg_abort_${submissionId}`,
          role: "system",
          purpose: "advisory",
          display: "diagnostic",
          submissionId,
          settlement: { outcome: "aborted" },
          timestamp: at(),
          parts: [{ type: "text", text: "Stopped.", state: "done" }],
        }),
      ),
    ],
    settlements: [
      ...chat.settlements,
      ...stopped.map((submissionId) => ({
        submissionId,
        outcome: "aborted" as const,
        timestamp: at(),
      })),
    ],
  };
}

/** Retry: sends the same request again. The new task starts at its first step. */
export function retryTask(chat: Chat, taskId: string): Chat {
  const old = tasksFromConversation(chat).find((t) => t.id === taskId);
  if (!old) return chat;
  const id = nextId();
  const task: TaskData = { title: old.title, plan: old.plan, current: 0, files: [] };
  return {
    ...chat,
    messages: [
      ...chat.messages,
      userMessage(id, old.request),
      {
        id: `msg_${id}`,
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId: id,
        timestamp: at(),
        parts: [{ type: "data-task", data: task }],
      },
    ],
  };
}

/**
 * Answers an approval with a signal message, then (standing in for the agent)
 * finishes the task: the file is changed, or left as it was.
 */
export function answerApproval(chat: Chat, taskId: string, answer: ApprovalAnswer): Chat {
  const view = tasksFromConversation(chat).find((t) => t.id === taskId);
  if (!view?.approval) return chat;
  const { approval } = view;
  const signalId = nextId();
  const signal: FlueConversationMessage = {
    id: `msg_in_${signalId}`,
    role: "system",
    purpose: "dispatch",
    display: "hidden",
    submissionId: signalId,
    signal: { tagName: APPROVAL_SIGNAL, attributes: { id: approval.id, answer } },
    timestamp: at(),
    parts: [{ type: "text", text: `${answer} ${approval.file}`, state: "done" }],
  };
  const messages = chat.messages.map((m): FlueConversationMessage => {
    if (m.submissionId !== taskId || m.role !== "assistant") return m;
    const parts = m.parts.map((p): FlueConversationPart => {
      if (p.type !== "data-task") return p;
      const data = (p as { data: TaskData }).data;
      return {
        type: "data-task",
        data: {
          ...data,
          current: data.plan.length - 1,
          ...(answer === "deny"
            ? { note: `${approval.file} was not changed.` }
            : { files: [...data.files, { path: approval.file, change: "changed", at: at() }] }),
        } satisfies TaskData,
      };
    });
    const edit: FlueConversationPart = {
      type: "dynamic-tool",
      toolName: "editFile",
      toolCallId: `call_${signalId}`,
      state: "output-available",
      input: { path: approval.file },
      output: { ok: true },
    };
    return { ...m, parts: answer === "deny" ? parts : [...parts, edit] };
  });
  const settled = (submissionId: string) => ({
    submissionId,
    outcome: "completed" as const,
    timestamp: at(),
  });
  return {
    ...chat,
    messages: [...messages, signal],
    settlements: [...chat.settlements, settled(signalId), settled(taskId)],
  };
}

// ---------------------------------------------------------------------------
// Mock conversations. Each chat holds one task (and, for the running one, a
// request queued behind it), in genuine Flue shapes.

const time = (daysAgo: number, hhmm: string) =>
  new Date(`2026-10-${String(10 - daysAgo).padStart(2, "0")}T${hhmm}:00Z`).toISOString();

interface MockStep {
  tool: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  running?: boolean;
}

interface MockTask {
  chat: string;
  request: string;
  at: string;
  task: TaskData;
  steps: MockStep[];
  approval?: ApprovalData;
  outcome?: "completed" | "failed" | "aborted";
  endedAt?: string;
  queued?: string;
}

function mockChat(id: string, spec: MockTask): Chat {
  const sub = `sub_${id}`;
  const parts: FlueConversationPart[] = [
    { type: "data-task", data: spec.task },
    ...spec.steps.map((s, i): FlueConversationPart => {
      const base = {
        type: "dynamic-tool" as const,
        toolName: s.tool,
        toolCallId: `call_${id}_${i}`,
      };
      if (s.running) return { ...base, state: "input-available", input: s.input };
      if (s.error)
        return {
          ...base,
          state: "output-error",
          input: s.input,
          errorText: s.error,
          durationMs: 800,
        };
      return {
        ...base,
        state: "output-available",
        input: s.input,
        output: s.output,
        durationMs: 1200,
      };
    }),
    ...(spec.approval ? [{ type: "data-approval" as const, data: spec.approval }] : []),
  ];
  const queuedId = `sub_${id}_q`;
  return {
    id,
    title: spec.chat,
    messages: [
      { ...userMessage(sub, spec.request), timestamp: spec.at },
      {
        id: `msg_${sub}`,
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId: sub,
        timestamp: spec.at,
        parts,
      },
      ...(spec.queued ? [{ ...userMessage(queuedId, spec.queued), timestamp: spec.at }] : []),
    ],
    settlements: spec.outcome
      ? [
          {
            submissionId: sub,
            outcome: spec.outcome,
            timestamp: spec.endedAt,
            ...(spec.outcome === "failed" ? { error: spec.steps.at(-1)?.error } : {}),
          },
        ]
      : [],
  };
}

const q3Plan = [
  "Read the Q3 figures",
  "Group spending by category",
  "Write the summary spreadsheet",
  "Check the totals",
];

const chats = {
  q3Running: mockChat("q3", {
    chat: "Q3 spending",
    request: "Summarize Q3 spending by category in a spreadsheet.",
    at: time(0, "09:52"),
    task: { title: "Q3 spending summary", plan: q3Plan, current: 1, files: [] },
    steps: [
      { tool: "readFile", input: { path: "Finance/2026-Q3.xlsx" }, output: {} },
      { tool: "groupRows", input: { by: "category" }, running: true },
    ],
    queued: "Then draft an email to the accountant with it.",
  }),
  q3Done: mockChat("q3", {
    chat: "Q3 spending",
    request: "Summarize Q3 spending by category in a spreadsheet.",
    at: time(0, "09:40"),
    task: {
      title: "Q3 spending summary",
      plan: q3Plan,
      current: 3,
      files: [{ path: "Outputs/Q3 summary.xlsx", change: "created", at: time(0, "09:43") }],
    },
    steps: [
      { tool: "readFile", input: { path: "Finance/2026-Q3.xlsx" }, output: {} },
      { tool: "groupRows", input: { by: "category" }, output: {} },
      { tool: "writeFile", input: { path: "Outputs/Q3 summary.xlsx" }, output: {} },
    ],
    outcome: "completed",
    endedAt: time(0, "09:44"),
  }),
  followUps: mockChat("followups", {
    chat: "Dupont follow-ups",
    request: "Add the follow-ups from the Dupont meeting to my todo list.",
    at: time(0, "09:30"),
    task: {
      title: "Follow-ups → todo list",
      plan: ["Read the meeting notes", "Add the follow-ups to Notes/todo.md"],
      current: 1,
      files: [],
    },
    steps: [{ tool: "readFile", input: { path: "Notes/meeting 2026-10-02.md" }, output: {} }],
    approval: {
      id: "appr_todo",
      file: "Notes/todo.md",
      summary: "Add 2 items at the top of your todo list",
      preview: [
        "+ - [ ] Send Dupont the revised phase 1 schedule",
        "+ - [ ] Ask Bois Lyonnais for the beam quote",
        "  - [ ] Call Hugo about the Dupont offer",
        "  - [ ] Send Q3 figures to the accountant",
      ],
    },
  }),
  deck: mockChat("deck", {
    chat: "Clients deck",
    request: "Summarize the Clients folder as a deck for Monday.",
    at: time(0, "08:40"),
    task: {
      title: "Clients deck",
      plan: ["Read the Clients folder", "Draft the slides"],
      current: 1,
      files: [{ path: "Outputs/clients.pptx", change: "created", at: time(0, "08:46") }],
    },
    steps: [
      { tool: "readFolder", input: { path: "Clients" }, output: { count: 34 } },
      { tool: "writeFile", input: { path: "Outputs/clients.pptx" }, output: {} },
    ],
    outcome: "completed",
    endedAt: time(0, "08:46"),
  }),
  invoices: mockChat("invoices", {
    chat: "Unpaid invoices",
    request: "List the unpaid invoices in a spreadsheet.",
    at: time(0, "08:10"),
    task: {
      title: "Unpaid invoices",
      plan: ["Read the invoices", "Write the list"],
      current: 0,
      files: [],
    },
    steps: [
      { tool: "readFolder", input: { path: "Finance/invoices" }, output: { count: 1 } },
      {
        tool: "readFile",
        input: { path: "Finance/invoices/INV-0412.pdf" },
        error: "The file is protected by a password.",
      },
    ],
    outcome: "failed",
    endedAt: time(0, "08:11"),
  }),
  contacts: mockChat("contacts", {
    chat: "Contacts",
    request: "Make a spreadsheet of all client contacts.",
    at: time(1, "16:20"),
    task: {
      title: "Contacts list",
      plan: ["Read the Clients folder", "Write the spreadsheet"],
      current: 1,
      files: [{ path: "Outputs/contacts.xlsx", change: "created", at: time(1, "16:23") }],
    },
    steps: [
      { tool: "readFolder", input: { path: "Clients" }, output: { count: 34 } },
      { tool: "writeFile", input: { path: "Outputs/contacts.xlsx" }, output: {} },
    ],
    outcome: "completed",
    endedAt: time(1, "16:23"),
  }),
  mail: mockChat("mail", {
    chat: "Last week's mail",
    request: "Summarize my mail from last week.",
    at: time(3, "11:05"),
    task: {
      title: "Last week's mail",
      plan: ["Read the messages", "Group them by thread", "Write the summary"],
      current: 1,
      files: [],
    },
    steps: [{ tool: "readFolder", input: { path: "Mail" }, output: { count: 48 } }],
    outcome: "aborted",
    endedAt: time(3, "11:07"),
  }),
};

export type TasksScenario = "everything" | "empty" | "running" | "waiting" | "failed" | "done";

export const scenarios: Record<TasksScenario, Chat[]> = {
  everything: [
    chats.q3Running,
    chats.followUps,
    chats.deck,
    chats.invoices,
    chats.contacts,
    chats.mail,
  ],
  empty: [],
  running: [chats.q3Running, chats.deck, chats.contacts],
  waiting: [chats.followUps, chats.deck, chats.contacts],
  failed: [chats.invoices, chats.deck, chats.contacts],
  done: [
    chats.q3Done,
    chats.deck,
    answerApproval(chats.followUps, "sub_followups", "once"),
    chats.contacts,
    chats.mail,
  ],
};
