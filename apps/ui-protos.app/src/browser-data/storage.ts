import type { ChatEntry } from "../conversations/chat-index.js";

// What Sandclaw keeps in this browser, and what each kind costs to lose. The
// user's files are not here: they stay in their folder on disk.

export type PartKind = "chats" | "indexes" | "settings" | "identity" | "drafts";

/**
 * What comes back if the browser clears it:
 * - `rebuilt`: rebuilt from the user's files, on its own;
 * - `relink`: comes back by linking this browser again from another device;
 * - `lost`: gone, unless the user kept a copy.
 */
export type Recovery = "rebuilt" | "relink" | "lost";

export interface StoragePart {
  kind: PartKind;
  label: string;
  bytes: number;
  recovery: Recovery;
  /** What it is, in one line. */
  what: string;
  /** What clearing it means, in the user's words. */
  ifCleared: string;
}

export const KB = 1024;
export const MB = 1024 * KB;
export const GB = 1024 * MB;
const DAY = 24 * 60 * 60 * 1000;

export const mockParts: StoragePart[] = [
  {
    kind: "chats",
    label: "Chats",
    bytes: 12 * MB,
    recovery: "lost",
    what: "Every conversation with the assistant.",
    ifCleared: "Lost, unless you saved a copy.",
  },
  {
    kind: "indexes",
    label: "Search indexes",
    bytes: 340 * MB,
    recovery: "rebuilt",
    what: "What the assistant learnt by reading your folder.",
    ifCleared: "Rebuilt from your files; answers miss things until it's done.",
  },
  {
    kind: "settings",
    label: "Settings",
    bytes: 48 * KB,
    recovery: "lost",
    what: "Layout, AI model, preferences.",
    ifCleared: "Back to the defaults.",
  },
  {
    kind: "identity",
    label: "Identity",
    bytes: 6 * KB,
    recovery: "relink",
    what: "The keys that make this browser one of your devices.",
    ifCleared: "Losing it means linking this browser again from another device.",
  },
  {
    kind: "drafts",
    label: "Drafts",
    bytes: 220 * KB,
    recovery: "lost",
    what: "Questions and notes you started and did not send or save.",
    ifCleared: "Lost.",
  },
];

export interface StorageSummary {
  used: number;
  quota: number;
  /** `used / quota`, 0..1. */
  fraction: number;
  /** Bytes per recovery: how much would be lost, rebuilt, relinked. */
  bytes: Record<Recovery, number>;
  /** Parts per recovery, in the order given. */
  parts: Record<Recovery, StoragePart[]>;
}

export function summarize(parts: StoragePart[], quota: number): StorageSummary {
  const summary: StorageSummary = {
    used: 0,
    quota,
    fraction: 0,
    bytes: { rebuilt: 0, relink: 0, lost: 0 },
    parts: { rebuilt: [], relink: [], lost: [] },
  };
  for (const part of parts) {
    summary.used += part.bytes;
    summary.bytes[part.recovery] += part.bytes;
    summary.parts[part.recovery].push(part);
  }
  summary.fraction = quota > 0 ? Math.min(1, summary.used / quota) : 1;
  return summary;
}

/** "352 MB", "4 GB", "1.5 GB", "48 KB": one decimal below 10, none above. */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const shown = unit > 0 && value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${shown} ${units[unit]}`;
}

/** Where exported chats go, inside the user's folder. */
export const EXPORT_FOLDER = "Chats";

const isoDay = (at: Date) => at.toISOString().slice(0, 10);

/** "2026-10-10 Dupont start date.md": sortable by date, no characters a file system refuses. */
export function chatFileName(chat: Pick<ChatEntry, "title" | "createdAt">): string {
  const title = chat.title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  return `${isoDay(chat.createdAt)} ${title || "Chat"}.md`;
}

/** One file name per chat; a name already taken gets " (2)", " (3)", … */
export function exportFileNames(chats: Pick<ChatEntry, "title" | "createdAt">[]): string[] {
  const taken = new Set<string>();
  return chats.map((chat) => {
    const base = chatFileName(chat).slice(0, -3);
    let name = `${base}.md`;
    for (let n = 2; taken.has(name); n++) name = `${base} (${n}).md`;
    taken.add(name);
    return name;
  });
}

/** "sandclaw-chats-2026-10-10.zip". */
export const zipName = (now: Date) => `sandclaw-chats-${isoDay(now)}.zip`;

/** Chats whose last activity is more than `days` days before `now`. */
export const olderThan = (chats: ChatEntry[], days: number, now: Date) =>
  chats.filter((c) => now.getTime() - c.lastActivity.getTime() > days * DAY);
