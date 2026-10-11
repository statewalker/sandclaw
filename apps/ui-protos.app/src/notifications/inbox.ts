// Notifications: what can happen, where each kind is shown, and what is kept.
// Pure functions over plain data; the components only render their results.

export type NoticeKind =
  | "task-finished"
  | "task-failed"
  | "task-waiting"
  | "site-built"
  | "indexing-done"
  | "files-unreadable"
  | "invite-accepted"
  | "invite-declined"
  | "device-added"
  | "machine-offline"
  | "machine-online"
  | "service-down";

/** Where a kind is shown: the bell list and a toast, the bell list only, or nowhere. */
export type Channel = "bell-toast" | "bell" | "off";

/** Where one notice lands: the bell list, a toast, or the OS (tab in the background). */
export type Place = "bell" | "toast" | "os";

export type Section = "Tasks" | "Sites and files" | "Machine" | "Team" | "Security";

export interface KindInfo {
  /** The setting's label. */
  label: string;
  section: Section;
  /** Only admins receive it. */
  adminOnly?: boolean;
  /** Security-relevant: always bell + toast, cannot be changed. */
  locked?: boolean;
  /** Needs the person to do something; variant B toasts only these. */
  urgent?: boolean;
  /** The default channel. */
  channel: Channel;
  /** The toast's and the list row's action. */
  action?: string;
  /** The merged line for `n` repeats: "3 tasks finished". */
  many: (n: number) => string;
}

export const kinds: Record<NoticeKind, KindInfo> = {
  "task-finished": {
    label: "A task finished",
    section: "Tasks",
    channel: "bell-toast",
    action: "Open",
    many: (n) => `${n} tasks finished`,
  },
  "task-failed": {
    label: "A task failed",
    section: "Tasks",
    channel: "bell-toast",
    urgent: true,
    action: "Open",
    many: (n) => `${n} tasks failed`,
  },
  "task-waiting": {
    label: "A task waits for you",
    section: "Tasks",
    channel: "bell-toast",
    urgent: true,
    action: "Review",
    many: (n) => `${n} tasks wait for you`,
  },
  "site-built": {
    label: "A site was built",
    section: "Sites and files",
    channel: "bell-toast",
    action: "Open",
    many: (n) => `${n} sites built`,
  },
  "indexing-done": {
    label: "Indexing finished",
    section: "Sites and files",
    channel: "bell",
    many: (n) => `Indexing finished ${n} times`,
  },
  "files-unreadable": {
    label: "Files couldn't be read",
    section: "Sites and files",
    channel: "bell",
    action: "See files",
    many: (n) => `${n} times files couldn't be read`,
  },
  "machine-offline": {
    label: "The Sandclaw machine went offline",
    section: "Machine",
    channel: "bell-toast",
    urgent: true,
    many: (n) => `The machine went offline ${n} times`,
  },
  "machine-online": {
    label: "The Sandclaw machine is back online",
    section: "Machine",
    channel: "bell-toast",
    many: (n) => `The machine came back ${n} times`,
  },
  "service-down": {
    label: "A service is down",
    section: "Machine",
    adminOnly: true,
    channel: "bell-toast",
    urgent: true,
    action: "Services",
    many: (n) => `${n} services down`,
  },
  "invite-accepted": {
    label: "An invite was accepted",
    section: "Team",
    adminOnly: true,
    channel: "bell-toast",
    action: "Team",
    many: (n) => `${n} invites accepted`,
  },
  "invite-declined": {
    label: "An invite was declined",
    section: "Team",
    adminOnly: true,
    channel: "bell",
    many: (n) => `${n} invites declined`,
  },
  "device-added": {
    label: "A device was added to my identity",
    section: "Security",
    locked: true,
    urgent: true,
    channel: "bell-toast",
    action: "Review",
    many: (n) => `${n} devices added to your identity`,
  },
};

export const kindList = Object.keys(kinds) as NoticeKind[];

export interface Notice {
  id: string;
  kind: NoticeKind;
  at: Date;
  /** "Q3 figures summary finished" */
  title: string;
  /** "3 files produced · in “Finance”" */
  detail?: string;
  read: boolean;
}

/** Only the kinds the person changed; the rest keep their default. */
export type NoticeSettings = Partial<Record<NoticeKind, Channel>>;

export function channelOf(kind: NoticeKind, settings: NoticeSettings): Channel {
  const info = kinds[kind];
  return info.locked ? info.channel : (settings[kind] ?? info.channel);
}

/** A locked (security) kind keeps its channel whatever is asked. */
export function setChannel(
  settings: NoticeSettings,
  kind: NoticeKind,
  channel: Channel,
): NoticeSettings {
  return kinds[kind].locked ? settings : { ...settings, [kind]: channel };
}

/**
 * Where a new notice lands. A toast in a background tab would be missed, so it
 * becomes an OS notification when the browser allows them, and stays a toast
 * (seen on return) otherwise.
 */
export function placesFor(
  kind: NoticeKind,
  settings: NoticeSettings,
  tab: { background: boolean; osAllowed: boolean } = { background: false, osAllowed: false },
): Place[] {
  const channel = channelOf(kind, settings);
  if (channel === "off") return [];
  if (channel === "bell") return ["bell"];
  return ["bell", tab.background && tab.osAllowed ? "os" : "toast"];
}

/** One line of the list: a notice, or repeats of one kind merged. */
export interface NoticeGroup {
  id: string;
  kind: NoticeKind;
  /** Newest first. */
  notices: Notice[];
  at: Date;
  title: string;
  detail?: string;
  unread: boolean;
}

/** Repeats further apart than this stay separate lines. */
export const MERGE_WINDOW = 60 * 60 * 1000;

/**
 * Newest first. Notices of one kind within an hour of the line's newest merge
 * into one line, even with other kinds in between ("3 tasks finished"). Security notices never
 * merge: each device added must be seen on its own.
 */
export function groupRepeats(notices: Notice[]): NoticeGroup[] {
  const sorted = [...notices].sort((a, b) => b.at.getTime() - a.at.getTime());
  const runs: Notice[][] = [];
  for (const notice of sorted) {
    const run = kinds[notice.kind].locked
      ? undefined
      : runs.findLast((r) => r[0]?.kind === notice.kind);
    const head = run?.[0];
    if (run && head && head.at.getTime() - notice.at.getTime() <= MERGE_WINDOW) run.push(notice);
    else runs.push([notice]);
  }
  return runs.map((run) => {
    const [head] = run as [Notice, ...Notice[]];
    const merged = run.length > 1;
    return {
      id: run.map((n) => n.id).join("+"),
      kind: head.kind,
      notices: run,
      at: head.at,
      title: merged ? kinds[head.kind].many(run.length) : head.title,
      detail: merged ? run.map((n) => n.title).join(" · ") : head.detail,
      unread: run.some((n) => !n.read),
    };
  });
}

/**
 * The bell's badge: unread lines (merged repeats count once) that arrived since
 * the bell was last opened. Opening the bell clears the badge; the lines stay
 * marked unread until opened or "Mark all read".
 */
export function unreadCount(notices: Notice[], seenAt?: Date): number {
  const fresh = notices.filter((n) => !n.read && (!seenAt || n.at > seenAt));
  return groupRepeats(fresh).length;
}

export function markRead(notices: Notice[], ids?: string[]): Notice[] {
  return notices.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n));
}

export const KEEP_DAYS = 30;
export const KEEP_MAX = 100;
const DAY = 24 * 60 * 60 * 1000;

/** What this browser keeps: the last 30 days, at most the 100 newest. */
export function trim(notices: Notice[], now: Date): Notice[] {
  return notices
    .filter((n) => now.getTime() - n.at.getTime() <= KEEP_DAYS * DAY)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, KEEP_MAX);
}

/** "now", "5 min ago", "2 h ago", "yesterday", "3 Oct". */
export function ago(at: Date, now: Date): string {
  const min = Math.round((now.getTime() - at.getTime()) / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  if (min < 48 * 60) return "yesterday";
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
