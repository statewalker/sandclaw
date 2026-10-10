import { listFiles } from "../folder-zone/tree.js";
import { shortDate } from "../invitations-log/log.js";
import type { FolderEntry } from "../mock.js";

// First questions from the folder's file names alone: the listing is there the
// moment the folder is chosen, long before the assistant has read a single file.

/** "Dupont — offer.docx" → "Dupont": files about a client or a job are named that way. */
const topicOf = (name: string) => /^(.+?)\s+[—–-]\s+\S/.exec(name)?.[1]?.trim();

/** Names files are about, most files first (ties: first seen first). */
export function topics(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const name of names) {
    const topic = topicOf(name);
    if (topic) counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([topic]) => topic);
}

/** The latest of the values `pattern` captures from the names, by string order. */
const latest = (names: string[], pattern: RegExp) =>
  names
    .map((n) => pattern.exec(n)?.[1])
    .filter((v) => v !== undefined)
    .sort()
    .at(-1);

/**
 * Up to `max` first questions over a folder, most telling first: the job most
 * files are about, the latest quarter's figures, the latest meeting, a second
 * job, open invoices, the todo list. An empty folder gets none; a folder that
 * says nothing by its names gets one generic question.
 */
export function suggestQuestions(entries: FolderEntry[], max = 4): string[] {
  const paths = listFiles(entries).map((f) => f.path);
  if (paths.length === 0) return [];
  const names = paths.map((p) => p.split("/").at(-1) ?? p);
  const [first, second] = topics(names);
  const quarter = latest(names, /\b(Q[1-4])\b/i);
  const meeting = latest(names, /^meeting (\d{4}-\d{2}-\d{2})/i);

  const questions: string[] = [];
  if (first) questions.push(`What's the status of the ${first} job?`);
  if (quarter) questions.push(`Summarise the ${quarter.toUpperCase()} figures`);
  if (meeting)
    questions.push(`What did we agree at the meeting on ${shortDate(new Date(meeting))}?`);
  if (second) questions.push(`What do we have on ${second}?`);
  if (paths.some((p) => /(^|\/)invoices\//i.test(p)))
    questions.push("Which invoices are still unpaid?");
  if (names.some((n) => n.toLowerCase() === "todo.md"))
    questions.push("What's still open on my todo list?");
  if (questions.length === 0) questions.push("What is in this folder?");
  return questions.slice(0, max);
}
