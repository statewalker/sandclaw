import type { InviteEvent, IssuedInvite } from "../mock.js";

/** Where an invite stands, derived from its events (A10). */
export type InviteState = "waiting" | "accepted" | "declined" | "expired" | "cancelled";

export const states: InviteState[] = ["waiting", "accepted", "declined", "expired", "cancelled"];

/** How far back the log looks, in days. */
export type Period = 7 | 30 | 90 | "all";

export interface LogEntry {
  invite: IssuedInvite;
  /** Oldest first. An expiry the hub did not record is added at `expiresAt`. */
  events: InviteEvent[];
  state: InviteState;
}

const DAY = 24 * 60 * 60 * 1000;

/** One entry per invite, newest invite first. */
export function buildLog(invites: IssuedInvite[], events: InviteEvent[], now: Date): LogEntry[] {
  return invites
    .map((invite) => {
      const own = events
        .filter((e) => e.inviteId === invite.id)
        .sort((a, b) => a.at.getTime() - b.at.getTime());
      const last = own.findLast((e) => e.kind !== "created");
      if (last) return { invite, events: own, state: last.kind as InviteState };
      if (invite.expiresAt <= now) {
        const expired: InviteEvent = { inviteId: invite.id, kind: "expired", at: invite.expiresAt };
        return { invite, events: [...own, expired], state: "expired" as const };
      }
      return { invite, events: own, state: "waiting" as const };
    })
    .sort((a, b) => b.invite.createdAt.getTime() - a.invite.createdAt.getTime());
}

/** Lower case, accents removed: "Inès" → "ines". */
function fold(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function inPeriod(at: Date, period: Period, now: Date) {
  return period === "all" || now.getTime() - at.getTime() <= period * DAY;
}

/** Matches the invite's label, its creator, and who joined from which device. */
function matches(entry: LogEntry, query: string) {
  const q = fold(query.trim());
  if (!q) return true;
  const words = [
    entry.invite.label,
    entry.invite.createdBy,
    ...entry.events.flatMap((e) => [e.person, e.device, e.by]),
  ];
  return words.some((w) => w && fold(w).includes(q));
}

/** Entries with an event in the period that match the search. */
export function filterLog(entries: LogEntry[], period: Period, query: string, now: Date) {
  return entries.filter(
    (entry) => entry.events.some((e) => inPeriod(e.at, period, now)) && matches(entry, query),
  );
}

export function countByState(entries: LogEntry[]): Record<InviteState, number> {
  const counts = Object.fromEntries(states.map((s) => [s, 0])) as Record<InviteState, number>;
  for (const entry of entries) counts[entry.state]++;
  return counts;
}

/** "in 6 days", "tomorrow", "today". */
export function daysUntil(at: Date, now: Date) {
  const days = Math.round((at.getTime() - now.getTime()) / DAY);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

/** "2 Oct". */
export function shortDate(at: Date) {
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
