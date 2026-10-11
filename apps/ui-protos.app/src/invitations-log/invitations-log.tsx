import { Button, Card, cn, Input } from "@statewalker/ui.view.shadcn";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import {
  type InviteEvent,
  type IssuedInvite,
  inviteEvents,
  issuedInvites,
  today,
} from "../mock.js";
import {
  buildLog,
  countByState,
  daysUntil,
  filterLog,
  type InviteState,
  inPeriod,
  type LogEntry,
  type Period,
  shortDate,
  states,
} from "./log.js";

/**
 * How the admin reads what happened to issued invites:
 * - `by-invite`: one row per invite, its current state and outcome; a row opens its timeline;
 * - `event-log`: one line per event, newest first, grouped by day.
 */
export type LogVariant = "by-invite" | "event-log";

export interface InvitationsLogProps {
  variant?: LogVariant;
  period?: Period;
  query?: string;
  invites?: IssuedInvite[];
  events?: InviteEvent[];
  /** "Now"; `today` from the mock by default. */
  now?: Date;
}

const periods: [Period, string][] = [
  [7, "Last 7 days"],
  [30, "Last 30 days"],
  [90, "Last 90 days"],
  ["all", "All"],
];

const stateWords: Record<InviteState, string> = {
  waiting: "Waiting",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};

const stateDot: Record<InviteState, string> = {
  waiting: "bg-warning",
  accepted: "bg-success",
  declined: "bg-destructive",
  expired: "bg-muted-foreground",
  cancelled: "bg-muted-foreground",
};

function StateTag({ state }: { state: InviteState }) {
  return (
    <span className="bg-secondary inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs">
      <span className={cn("size-2 rounded-full", stateDot[state])} />
      {stateWords[state]}
    </span>
  );
}

/** "Hugo Benali joined from Chrome on Windows", "Expired unused on 2 Oct", … */
function outcome(entry: LogEntry, now: Date) {
  const last = entry.events.at(-1);
  switch (entry.state) {
    case "waiting":
      return `Not answered yet · expires ${daysUntil(entry.invite.expiresAt, now)}`;
    case "accepted":
      return `${last?.person} joined from ${last?.device}`;
    case "declined":
      return `Declined on ${shortDate(last?.at ?? now)}`;
    case "expired":
      return `Expired unused on ${shortDate(last?.at ?? now)}`;
    case "cancelled":
      return `Cancelled by ${last?.by} on ${shortDate(last?.at ?? now)}`;
  }
}

/** One event as a sentence, naming the invite when `label` is given. */
function eventText(e: InviteEvent, label?: string) {
  const of = label ? ` “${label}”` : "";
  switch (e.kind) {
    case "created":
      return `${e.by} created the invite${of}`;
    case "accepted":
      return `${e.person} joined${label ? ` with${of}` : ""} from ${e.device}`;
    case "declined":
      return `The invite${of} was declined`;
    case "expired":
      return `The invite${of} expired unused`;
    case "cancelled":
      return `${e.by} cancelled the invite${of}`;
  }
}

const time = (at: Date) =>
  at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function InviteRow({ entry, now }: { entry: LogEntry; now: Date }) {
  const [open, setOpen] = useState(false);
  const { invite } = entry;
  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="hover:bg-accent flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{invite.label}</span>
            <span className="text-muted-foreground text-xs">{invite.role}</span>
          </span>
          <span className="block text-sm">{outcome(entry, now)}</span>
          <span className="text-muted-foreground block text-xs">
            Created by {invite.createdBy} on {shortDate(invite.createdAt)}
          </span>
        </span>
        <StateTag state={entry.state} />
      </button>
      {open && (
        <ol className="text-muted-foreground mb-3 ml-11 grid gap-1 border-l pl-4 text-sm">
          {entry.events.map((e) => (
            <li key={`${e.kind}:${e.at.toISOString()}`}>
              <span className="tabular-nums">
                {shortDate(e.at)} {time(e.at)}
              </span>{" "}
              · {eventText(e)}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

function EventFeed({ entries, period, now }: { entries: LogEntry[]; period: Period; now: Date }) {
  const lines = entries
    .flatMap((entry) => entry.events.map((event) => ({ event, entry })))
    .filter(({ event }) => inPeriod(event.at, period, now))
    .sort((a, b) => b.event.at.getTime() - a.event.at.getTime());
  const days = Map.groupBy(lines, ({ event }) => shortDate(event.at));
  return (
    <div className="grid gap-4 p-4">
      {[...days].map(([day, items]) => (
        <section key={day}>
          <h3 className="text-muted-foreground mb-1 text-xs font-medium uppercase">{day}</h3>
          <ul className="grid gap-1">
            {items.map(({ event, entry }) => (
              <li
                key={`${entry.invite.id}:${event.kind}`}
                className="flex items-baseline gap-3 text-sm"
              >
                <span className="text-muted-foreground w-10 shrink-0 tabular-nums text-xs">
                  {time(event.at)}
                </span>
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    event.kind === "created" ? "bg-primary" : stateDot[event.kind],
                  )}
                />
                <span>{eventText(event, entry.invite.label)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function InvitationsLog({
  variant = "by-invite",
  period: initialPeriod = 30,
  query: initialQuery = "",
  invites = issuedInvites,
  events = inviteEvents,
  now = today,
}: InvitationsLogProps) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [query, setQuery] = useState(initialQuery);
  const [only, setOnly] = useState<InviteState | "all">("all");

  const found = filterLog(buildLog(invites, events, now), period, query, now);
  const counts = countByState(found);
  const shown = only === "all" ? found : found.filter((e) => e.state === only);
  const span =
    period === "all" ? "whole log" : (periods.find(([p]) => p === period)?.[1].toLowerCase() ?? "");

  const chip = (value: InviteState | "all", label: string, count: number) => (
    <button
      key={value}
      type="button"
      aria-pressed={only === value}
      onClick={() => setOnly(value)}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        only === value ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent",
      )}
    >
      {label} {count}
    </button>
  );

  let empty = "";
  if (found.length === 0 && !query.trim()) {
    empty = period === "all" ? "No invites yet" : `No invites in the ${span}`;
  } else if (found.length === 0) {
    empty = `No invites match “${query.trim()}” in the ${span}`;
  } else if (shown.length === 0) {
    empty = `No ${stateWords[only as InviteState].toLowerCase()} invites in the ${span}`;
  }

  return (
    <Card className="w-full max-w-2xl gap-0 py-0">
      <div className="grid gap-3 border-b p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">Invitations</h2>
          <div className="bg-secondary flex flex-wrap rounded-md p-0.5">
            {periods.map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={period === value ? "outline" : "ghost"}
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
                className="h-7"
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            aria-label="Search invitations"
            placeholder="Search by name, device or who created it"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {chip("all", "All", found.length)}
          {states.map((s) => chip(s, stateWords[s], counts[s]))}
        </div>
      </div>
      {empty ? (
        <p className="text-muted-foreground p-8 text-center text-sm">{empty}</p>
      ) : variant === "by-invite" ? (
        <ul>
          {shown.map((entry) => (
            <InviteRow key={entry.invite.id} entry={entry} now={now} />
          ))}
        </ul>
      ) : (
        <EventFeed entries={shown} period={period} now={now} />
      )}
    </Card>
  );
}
