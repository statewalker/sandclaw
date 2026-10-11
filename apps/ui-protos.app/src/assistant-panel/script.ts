// Scripted conversations for the assistant-panel prototype. A script is a list
// of events played one after another; an `ask` event stops the playback until
// the user answers it. Nothing here talks to a model.

export type StepState = "done" | "running" | "failed";

/** Asking before changing a file that already exists. */
export interface Approval {
  kind: "approval";
  file: string;
  summary: string;
  /** Unified-diff style lines: "+ added", "- removed", "  kept". */
  diff: string[];
}

/** Asking, on first use, before reaching outside the folder. */
export interface Consent {
  kind: "consent";
  connector: string;
  purpose: string;
  access: string;
}

export type Request = Approval | Consent;

export type ScriptEvent =
  | { kind: "user"; text: string }
  | { kind: "say"; text: string }
  | { kind: "task"; title: string }
  | { kind: "step"; label: string; state: StepState }
  | { kind: "output"; file: string; change: "created" | "changed" }
  | { kind: "finish"; note?: string }
  | { kind: "ask"; request: Request; onDeny: ScriptEvent[] };

export type ScenarioId = "deck" | "todos" | "mail";

export const scenarios: Record<ScenarioId, ScriptEvent[]> = {
  deck: [
    { kind: "user", text: "Summarize the Clients folder as a deck for Monday." },
    { kind: "task", title: "Clients deck" },
    { kind: "step", label: "Read 34 files in Clients", state: "done" },
    { kind: "step", label: "Pulled out the main points per client", state: "done" },
    { kind: "step", label: "Drafted 8 slides", state: "done" },
    { kind: "output", file: "Outputs/clients.pptx", change: "created" },
    { kind: "finish" },
    {
      kind: "say",
      text: "The deck is in Outputs. Dupont and Leroy have open offers; both are on slide 3.",
    },
  ],
  todos: [
    { kind: "user", text: "Add the follow-ups from the Dupont meeting to my todo list." },
    { kind: "task", title: "Follow-ups → todo list" },
    { kind: "step", label: "Read Notes/meeting 2026-10-02.md", state: "done" },
    { kind: "step", label: "Found 2 follow-ups", state: "done" },
    {
      kind: "ask",
      request: {
        kind: "approval",
        file: "Notes/todo.md",
        summary: "Add 2 items at the top of your todo list",
        diff: [
          "+ - [ ] Send Dupont the revised phase 1 schedule",
          "+ - [ ] Ask Bois Lyonnais for the beam quote",
          "  - [ ] Call Hugo about the Dupont offer",
          "  - [ ] Send Q3 figures to the accountant",
        ],
      },
      onDeny: [{ kind: "finish", note: "Your todo list was not changed." }],
    },
    { kind: "step", label: "Added 2 items to Notes/todo.md", state: "done" },
    { kind: "output", file: "Notes/todo.md", change: "changed" },
    { kind: "finish" },
  ],
  mail: [
    { kind: "user", text: "Summarize my mail from last week." },
    {
      kind: "ask",
      request: {
        kind: "consent",
        connector: "Mail",
        purpose: "to read your messages from the last 7 days",
        access: "Read-only. Your sign-in is saved in this browser and never leaves it.",
      },
      onDeny: [{ kind: "say", text: "Fine — I won't touch your mail. Ask again any time." }],
    },
    { kind: "task", title: "Last week's mail" },
    { kind: "step", label: "Read 48 messages (Mail)", state: "done" },
    { kind: "step", label: "Grouped them into 6 threads", state: "done" },
    { kind: "output", file: "Outputs/mail 2026-W40.md", change: "created" },
    { kind: "finish" },
    {
      kind: "say",
      text: "Two threads need an answer from you: the insurance renewal and Leroy's brief.",
    },
  ],
};
