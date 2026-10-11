// The Sandclaw chat index. A Flue session has no API to list, rename or delete
// sessions, so Sandclaw keeps its own index of the chats it has opened: one entry
// per session (the session URL is built from the entry's id). The conversations
// UI shows this index; removing a chat archives it here, the session stays.
// Everything below is pure: each operation returns a new index.

import { answerText, findAnswer } from "../ask/answers.js";
import type { FlueConversationMessage } from "../chat/flue.js";
import type { FlueState } from "../chat/flue-runtime.js";
import { today } from "../mock.js";

export interface ChatEntry {
  /** The chat id Sandclaw chose; the Flue session URL ends with it. */
  id: string;
  title: string;
  /** Renamed by the user: the title no longer follows the first question. */
  titleEdited: boolean;
  createdAt: Date;
  lastActivity: Date;
  archived: boolean;
  /** The last thing said, one line. Empty for a chat with no messages yet. */
  preview: string;
}

export type ChatIndex = ChatEntry[];

export const UNTITLED = "New chat";

/** The first question as a title: no question mark, at most ~48 characters. */
export function titleFrom(question: string): string {
  const text = question
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?.!]+$/, "");
  if (text.length <= 48) return text || UNTITLED;
  return `${text.slice(0, 47).replace(/\s+\S*$/, "")}…`;
}

export function newChat(index: ChatIndex, id: string, at: Date): ChatIndex {
  const entry: ChatEntry = {
    id,
    title: UNTITLED,
    titleEdited: false,
    createdAt: at,
    lastActivity: at,
    archived: false,
    preview: "",
  };
  return [entry, ...index];
}

const patch = (index: ChatIndex, id: string, change: (e: ChatEntry) => Partial<ChatEntry>) =>
  index.map((e) => (e.id === id ? { ...e, ...change(e) } : e));

/**
 * What the session reports: the first question (titles an untitled chat), the
 * latest text (the preview) and, when something new was said, its time.
 */
export function recordActivity(
  index: ChatIndex,
  id: string,
  activity: { firstQuestion?: string; preview: string; at?: Date },
): ChatIndex {
  return patch(index, id, (e) => ({
    preview: activity.preview,
    lastActivity: activity.at ?? e.lastActivity,
    title: !e.titleEdited && activity.firstQuestion ? titleFrom(activity.firstQuestion) : e.title,
  }));
}

/** An empty title keeps the current one. */
export function rename(index: ChatIndex, id: string, title: string): ChatIndex {
  const t = title.trim();
  return t ? patch(index, id, () => ({ title: t, titleEdited: true })) : index;
}

export const archive = (index: ChatIndex, id: string) =>
  patch(index, id, () => ({ archived: true }));
export const unarchive = (index: ChatIndex, id: string) =>
  patch(index, id, () => ({ archived: false }));

/** Most recent first. */
export const byActivity = (entries: ChatEntry[]) =>
  [...entries].sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());

// --- Search ------------------------------------------------------------------

/** Lower case, accents removed: "Inès" and "ines" are the same word. */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Chats whose title or messages contain every word of the query, accents
 * ignored. `textOf` gives a chat's message text.
 */
export function searchChats(
  entries: ChatEntry[],
  query: string,
  textOf: (id: string) => string,
): ChatEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries;
  return entries.filter((e) => {
    const haystack = fold(`${e.title}\n${textOf(e.id)}`);
    return words.every((w) => haystack.includes(w));
  });
}

/** A few words around the first match in the messages, to show why a chat matched. */
export function matchSnippet(text: string, query: string): string | undefined {
  const word = fold(query).split(/\s+/).find(Boolean);
  if (!word) return undefined;
  // Folding keeps the length for the precomposed letters used here, so the
  // position in the folded text is the position in the original.
  const at = fold(text).indexOf(word);
  if (at < 0) return undefined;
  const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, at - 30)) + 1);
  return `${start > 0 ? "…" : ""}${text.slice(start, at + word.length + 50).replace(/\s+/g, " ")}…`;
}

// --- Time groups ---------------------------------------------------------------

export type TimeGroup = "Today" | "Yesterday" | "Previous 7 days" | "Earlier";

const DAY = 86_400_000;
const dayOf = (d: Date) => Math.floor(d.getTime() / DAY);
const daysBetween = (d: Date, now: Date) => dayOf(now) - dayOf(d);

export function timeGroup(d: Date, now: Date): TimeGroup {
  const days = daysBetween(d, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "Previous 7 days";
  return "Earlier";
}

/** Chats by time group, most recent first; empty groups left out. */
export function groupByTime(entries: ChatEntry[], now: Date) {
  const groups = new Map<TimeGroup, ChatEntry[]>();
  for (const e of byActivity(entries)) {
    const g = timeGroup(e.lastActivity, now);
    groups.set(g, [...(groups.get(g) ?? []), e]);
  }
  return [...groups].map(([label, chats]) => ({ label, chats }));
}

/** "09:40" today, "Yesterday", "Tue" this week, "28 Sep" before. */
export function activityLabel(d: Date, now: Date): string {
  const g = timeGroup(d, now);
  const opts = { timeZone: "UTC" } as const;
  if (g === "Today")
    return d.toLocaleTimeString("en-GB", { ...opts, hour: "2-digit", minute: "2-digit" });
  if (g === "Yesterday") return "Yesterday";
  if (g === "Previous 7 days") return d.toLocaleDateString("en-GB", { ...opts, weekday: "short" });
  return d.toLocaleDateString("en-GB", { ...opts, day: "numeric", month: "short" });
}

// --- Transcripts ---------------------------------------------------------------

const visible = (s: FlueState) => s.messages.filter((m) => m.display === "visible");
const textParts = (m: FlueConversationMessage) =>
  m.parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join(" ")
    .trim();

/** All the text said in a chat, for search. */
export const transcriptText = (s: FlueState) => visible(s).map(textParts).join("\n");

/** What the index needs from a session's state. */
export function activityOf(s: FlueState) {
  const shown = visible(s);
  const first = shown.find((m) => m.role === "user");
  const last = shown.findLast((m) => textParts(m));
  return {
    count: shown.length,
    firstQuestion: first && textParts(first),
    preview: last ? textParts(last) : "",
  };
}

/** Sources cited through the `ask` tool in a reply. */
const sourcesOf = (m: FlueConversationMessage) =>
  m.parts.flatMap((p) =>
    p.type === "dynamic-tool" && p.state === "output-available"
      ? ((p.output as { sources?: { n: number; path: string }[] }).sources ?? [])
      : [],
  );

/** The chat as a Markdown note in `Notes/`: each question, its answer, its sources. */
export function chatAsNote(entry: ChatEntry, s: FlueState) {
  const name = entry.title.replace(/[\\/:*?"<>|]/g, "-");
  const body = visible(s).map((m) => {
    if (m.role === "user") return `## ${textParts(m)}`;
    const sources = sourcesOf(m).map((src) => `[${src.n}] ${src.path}`);
    return [textParts(m), ...(sources.length ? ["", ...sources.map((x) => `- ${x}`)] : [])].join(
      "\n",
    );
  });
  return {
    path: `Notes/${name}.md`,
    markdown: [`# ${entry.title}`, "", ...body.flatMap((b) => [b, ""])].join("\n"),
  };
}

// --- Mock chats ------------------------------------------------------------------

/** One question and its answer. Without `answer`, the scripted `ask` answer is used. */
export interface Turn {
  question: string;
  answer?: string;
}

/** A session that already happened: Flue messages and settlements for the turns. */
export function sessionState(id: string, turns: Turn[]): FlueState {
  const messages: FlueConversationMessage[] = turns.flatMap(({ question, answer }, i) => {
    const submissionId = `sub_${id}_${i}`;
    const grounded = answer === undefined ? findAnswer(question) : undefined;
    const user: FlueConversationMessage = {
      id: `${id}_q${i}`,
      role: "user",
      purpose: "user",
      display: "visible",
      submissionId,
      parts: [{ type: "text", text: question, state: "done" }],
    };
    const reply: FlueConversationMessage = {
      id: `${id}_a${i}`,
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      submissionId,
      parts: grounded
        ? [
            {
              type: "dynamic-tool",
              toolName: "ask",
              toolCallId: `${id}_call${i}`,
              state: "output-available",
              input: { question },
              output: grounded,
            },
            { type: "text", text: answerText(grounded), state: "done" },
          ]
        : [{ type: "text", text: answer ?? "", state: "done" }],
    };
    return [user, reply];
  });
  const settlements = turns.map((_, i) => ({
    submissionId: `sub_${id}_${i}`,
    outcome: "completed" as const,
  }));
  return { messages, settlements };
}

const at = (days: number, hour: number, minute = 0) =>
  new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days, hour, minute),
  );

export interface MockChat {
  entry: ChatEntry;
  turns: Turn[];
  /** A question still being answered when the prototype opens. */
  asking?: string;
}

const chat = (
  id: string,
  title: string,
  when: Date,
  turns: Turn[],
  extra: Partial<ChatEntry> & { asking?: string } = {},
): MockChat => {
  const { asking, ...rest } = extra;
  const { preview } = activityOf(sessionState(id, turns));
  return {
    entry: {
      id,
      title,
      titleEdited: title !== titleFrom(turns[0]?.question ?? asking ?? ""),
      createdAt: when,
      lastActivity: when,
      archived: false,
      preview,
      ...rest,
    },
    turns,
    asking,
  };
};

/** Claire's chats, relative to the prototypes' `today` (10 October, 10:00). */
export const mockChats: MockChat[] = [
  chat("c_dupont", "Dupont start date", at(0, 9, 40), [
    { question: "When does the Dupont job start?" },
  ]),
  chat("c_leroy_timber", "How much did we pay for the Leroy roof timber", at(0, 9, 55), [], {
    asking: "How much did we pay for the Leroy roof timber?",
  }),
  chat("c_budget", "Dupont budget and foreman", at(0, 8, 15), [
    { question: "What is the Dupont budget, and who is the site foreman?" },
  ]),
  chat("c_q3", "Q3 figures for the accountant", at(1, 16, 20), [
    {
      question: "Which Q3 figures does the accountant need?",
      answer:
        "The accountant asked for the Q3 revenue, the list of open invoices and the VAT summary. Finance/2026-Q3.xlsx has all three on its first sheet.",
    },
  ]),
  chat("c_beams", "Beam quote from Bois Lyonnais", at(3, 11, 5), [
    {
      question: "Did Bois Lyonnais send the beam quote?",
      answer:
        "Not yet. Asking Bois Lyonnais for the beam quote is still open in Notes/meeting 2026-10-02.md.",
    },
    {
      question: "Who should ask them?",
      answer: "The meeting notes don't say who follows up. Hugo handled their last order.",
    },
  ]),
  chat("c_insurance", "Insurance renewal", at(5, 14, 30), [
    {
      question: "Is the insurance contract renewed?",
      answer: "Yes. “Renew the insurance contract” is ticked off in Notes/todo.md.",
    },
  ]),
  chat("c_leroy_brief", "Leroy brief summary", at(12, 10, 0), [
    {
      question: "Summarise the Leroy brief",
      answer:
        "Leroy wants the attic turned into a bedroom: new oak stairs, roof insulation and two skylights. The brief asks for a quote before the end of October.",
    },
  ]),
  chat("c_kitchen", "Dupont kitchen plan", at(20, 15, 45), [
    {
      question: "Who drew the Dupont kitchen plan?",
      answer: "Inès Garnier drew it on 18 September; the plan is attached to the Dupont offer.",
    },
  ]),
  chat(
    "c_hello",
    "Hello, what can you do",
    at(30, 9, 0),
    [
      {
        question: "Hello, what can you do?",
        answer:
          "I answer questions from the files in your folder, with the passages I used, and I can write notes and to-dos there.",
      },
    ],
    { archived: true },
  ),
];
