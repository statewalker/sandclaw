import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Input,
  Label,
} from "@statewalker/ui.view.shadcn";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronRight,
  HardDrive,
  Loader2,
  type LucideIcon,
  Mail,
  Plug,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { today } from "../mock.js";
import {
  type Connector,
  type ConnectorKind,
  type ConnectorState,
  catalog,
  choicesFor,
  connectors as mockConnectors,
  mockSignIn,
  newConnector,
  type Permission,
  revoke,
  revokeEffects,
  type SignInResult,
  setPermission,
  stateOf,
  validateAddress,
} from "./connector-model.js";

/**
 * How the member sees their connectors:
 * - `list`: one line per connector; a line opens the connector's own page;
 * - `cards`: one card per connector, its capabilities and choices shown in place.
 */
export type ConnectorsVariant = "list" | "cards";

export interface ConnectorsProps {
  variant?: ConnectorsVariant;
  connectors?: Connector[];
  /** The connector whose page is open at first (`list`). */
  open?: string;
  /** Opens "Add a connector"; `advanced` also opens the MCP-address form, filled with `address`. */
  adding?: boolean | "advanced";
  address?: string;
  /** Opens the revoke confirmation for this connector. */
  revoking?: string;
  /** The sign-in popup; a pretend one that succeeds after a while by default. */
  signIn?: (connector: Connector) => Promise<SignInResult>;
  /** "Now"; `today` from the mock by default. */
  now?: Date;
}

const icons: Record<ConnectorKind, LucideIcon> = {
  mail: Mail,
  calendar: Calendar,
  drive: HardDrive,
  mcp: Plug,
};

const stateWords: Record<ConnectorState, string> = {
  "not-connected": "Not connected",
  connecting: "Signing in…",
  connected: "Connected",
  expired: "Sign-in expired",
  down: "Not answering",
};

const stateDot: Record<ConnectorState, string> = {
  "not-connected": "bg-muted-foreground",
  connecting: "bg-primary animate-pulse",
  connected: "bg-success",
  expired: "bg-warning",
  down: "bg-destructive",
};

const permissionWords: Record<Permission, string> = {
  allowed: "Allowed",
  ask: "Ask each time",
  off: "Off",
};

function StateTag({ state }: { state: ConnectorState }) {
  return (
    <span className="bg-secondary inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs">
      <span className={cn("size-2 rounded-full", stateDot[state])} />
      {stateWords[state]}
    </span>
  );
}

const time = (at: Date) =>
  at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const day = (at: Date) =>
  at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** "09:42" today, "7 Oct" before. */
const when = (at: Date, now: Date) => (day(at) === day(now) ? time(at) : day(at));

/** "Drafted a reply to Mr Dupont — 09:42". */
function lastActivity(c: Connector, now: Date) {
  const last = c.activity?.[0];
  return last ? `${last.text} — ${when(last.at, now)}` : undefined;
}

interface Actions {
  onConnect: () => void;
  onCancel: () => void;
  onPermission: (capabilityId: string, permission: Permission) => void;
  onRevoke: () => void;
  onRemove: () => void;
}

/** Where the connector stands, in a sentence, with the one thing to do about it. */
function Status({
  c,
  state,
  now,
  onConnect,
  onCancel,
}: { c: Connector; state: ConnectorState; now: Date } & Actions) {
  switch (state) {
    case "not-connected":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p className="text-muted-foreground mr-auto">The assistant cannot use {c.name}.</p>
          <Button size="sm" onClick={onConnect}>
            Connect
          </Button>
        </div>
      );
    case "connecting":
      return (
        <div role="status" className="grid gap-2 rounded-md border p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="size-4 shrink-0 animate-spin" />
            Waiting for you to sign in to {c.name} in the popup window…
          </p>
          <p className="text-muted-foreground">
            No popup? Your browser may have blocked it, or it is behind this window.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onConnect}>
              Open it again
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      );
    case "expired":
      return (
        <div className="border-warning/60 bg-warning/10 grid gap-2 rounded-md border p-3 text-sm">
          <p className="font-medium">Your sign-in expired on {day(c.signIn?.expiresAt ?? now)}</p>
          <p className="text-muted-foreground">
            The assistant cannot use {c.name} until you sign in again as{" "}
            <span className="break-all">{c.signIn?.account}</span>. Your choices below are kept.
          </p>
          <div>
            <Button size="sm" onClick={onConnect}>
              Sign in again
            </Button>
          </div>
        </div>
      );
    case "down":
      return (
        <div className="border-destructive/50 bg-destructive/5 grid gap-1 rounded-md border p-3 text-sm">
          <p className="font-medium">
            {c.name} is not answering since {when(c.down?.since ?? now, now)}
          </p>
          <p className="text-muted-foreground">
            Your sign-in is fine; the service itself is unreachable ({c.down?.error}). The assistant
            tells you when it cannot reach it, and tries again the next time it needs it.
          </p>
        </div>
      );
    case "connected":
      return (
        <p className="text-sm">
          Signed in as <span className="break-all font-medium">{c.signIn?.account}</span>{" "}
          <span className="text-muted-foreground">
            since {day(c.signIn?.since ?? now)} · last used{" "}
            {c.signIn?.lastUsedAt ? when(c.signIn.lastUsedAt, now) : "not yet"}
          </span>
        </p>
      );
  }
}

/** What the connector lets the assistant do, each with allowed / ask each time / off. */
function Capabilities({
  c,
  onPermission,
}: {
  c: Connector;
  onPermission: Actions["onPermission"];
}) {
  if (c.capabilities.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        What it lets the assistant do shows here once you are signed in.
      </p>
    );
  }
  return (
    <ul className="grid gap-3">
      {c.capabilities.map((cap) => (
        <li key={cap.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 flex-1 basis-40 text-sm">
            <span className={cn(cap.kind === "other" && "font-mono")}>{cap.label}</span>
            {cap.kind === "send" && (
              <span className="text-muted-foreground block text-xs">
                Reaches other people: never without asking you.
              </span>
            )}
            {cap.kind === "other" && (
              <span className="text-muted-foreground block text-xs">
                A tool of this server; Sandclaw cannot tell what it does.
              </span>
            )}
          </span>
          <fieldset aria-label={cap.label} className="bg-secondary flex flex-wrap rounded-md p-0.5">
            {choicesFor(cap.kind).map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={cap.permission === p ? "outline" : "ghost"}
                aria-pressed={cap.permission === p}
                onClick={() => onPermission(cap.id, p)}
                className="h-7"
              >
                {permissionWords[p]}
              </Button>
            ))}
          </fieldset>
        </li>
      ))}
    </ul>
  );
}

function Footer({ c, onRevoke, onRemove }: { c: Connector } & Actions) {
  return c.signIn ? (
    <div>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={onRevoke}>
        Revoke
      </Button>
    </div>
  ) : (
    <div>
      <Button size="sm" variant="ghost" onClick={onRemove}>
        Remove from the list
      </Button>
    </div>
  );
}

function Heading({ c, state, as: H }: { c: Connector; state: ConnectorState; as: "h3" | "h2" }) {
  const Icon = icons[c.kind];
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <H className="min-w-0 truncate font-medium">{c.name}</H>
          <StateTag state={state} />
        </div>
        <p className="text-muted-foreground truncate text-xs">{c.via}</p>
      </div>
    </div>
  );
}

/** The connector's own page (`list`): everything about it, top to bottom. */
function ConnectorPage({
  c,
  now,
  onBack,
  ...actions
}: { c: Connector; now: Date; onBack: () => void } & Actions) {
  const state = stateOf(c, now);
  return (
    <section aria-label={c.name} className="grid gap-4 p-4">
      <div>
        <Button size="sm" variant="ghost" onClick={onBack} className="-ml-2">
          <ArrowLeft /> All connectors
        </Button>
      </div>
      <Heading c={c} state={state} as="h2" />
      <Status c={c} state={state} now={now} {...actions} />
      <div className="grid gap-2">
        <h3 className="text-sm font-medium">What it lets the assistant do</h3>
        <Capabilities c={c} onPermission={actions.onPermission} />
      </div>
      {c.activity && c.activity.length > 0 && (
        <div className="grid gap-1">
          <h3 className="text-sm font-medium">Recently</h3>
          <ul className="text-muted-foreground grid gap-1 text-sm">
            {c.activity.map((a) => (
              <li key={a.at.toISOString()} className="flex gap-3">
                <span className="w-12 shrink-0 tabular-nums">{when(a.at, now)}</span>
                <span className="min-w-0">{a.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Footer c={c} {...actions} />
    </section>
  );
}

/** One connector, its capabilities in place (`cards`). */
function ConnectorCard({ c, now, ...actions }: { c: Connector; now: Date } & Actions) {
  const state = stateOf(c, now);
  const activity = lastActivity(c, now);
  return (
    <section aria-label={c.name} className="grid gap-3 rounded-lg border p-4">
      <Heading c={c} state={state} as="h3" />
      <Status c={c} state={state} now={now} {...actions} />
      {activity && <p className="text-muted-foreground text-xs">Last: {activity}</p>}
      <Capabilities c={c} onPermission={actions.onPermission} />
      <Footer c={c} {...actions} />
    </section>
  );
}

/** One line per connector (`list`): state, account, last activity. */
function ConnectorLine({ c, now, onOpen }: { c: Connector; now: Date; onOpen: () => void }) {
  const state = stateOf(c, now);
  const Icon = icons[c.kind];
  const sub =
    state === "connected"
      ? (lastActivity(c, now) ?? c.signIn?.account)
      : state === "down"
        ? `Not answering since ${when(c.down?.since ?? now, now)}`
        : state === "expired"
          ? "Sign in again to use it"
          : c.via;
  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className="hover:bg-accent flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-sm font-medium">{c.name}</span>
            <StateTag state={state} />
          </span>
          <span className="text-muted-foreground min-w-0 truncate text-xs">{sub}</span>
        </span>
        <ChevronRight className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      </button>
    </li>
  );
}

/** "Add a connector": the short catalog, and an MCP server by address behind "Advanced". */
function AddConnector({
  added,
  advanced,
  address: initialAddress,
  onPick,
  onClose,
}: {
  added: Set<string>;
  advanced: boolean;
  address: string;
  onPick: (c: Connector) => void;
  onClose: () => void;
}) {
  const [address, setAddress] = useState(initialAddress);
  const [tried, setTried] = useState(Boolean(initialAddress));
  const error = tried ? validateAddress(address) : undefined;
  return (
    <section aria-label="Add a connector" className="grid gap-3 border-b p-4">
      <h3 className="font-medium">Add a connector</h3>
      <ul className="grid gap-2">
        {catalog.map((entry) => {
          const Icon = icons[entry.kind];
          return (
            <li key={entry.kind} className="flex items-center gap-3">
              <Icon className="text-muted-foreground size-5 shrink-0" />
              <span className="grid min-w-0 flex-1">
                <span className="text-sm font-medium">{entry.name}</span>
                <span className="text-muted-foreground text-xs">{entry.description}</span>
              </span>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Connect ${entry.name}`}
                disabled={added.has(entry.kind)}
                onClick={() => onPick(newConnector(entry))}
              >
                {added.has(entry.kind) ? "Added" : "Connect"}
              </Button>
            </li>
          );
        })}
      </ul>
      <Collapsible defaultOpen={advanced}>
        <CollapsibleTrigger className="text-muted-foreground group flex items-center gap-1 text-sm">
          <ChevronDown className="size-4 transition-transform group-data-[state=closed]:-rotate-90" />
          Advanced
        </CollapsibleTrigger>
        <CollapsibleContent>
          <form
            noValidate
            className="mt-3 grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setTried(true);
              if (!validateAddress(address)) onPick(newConnector({ address: address.trim() }));
            }}
          >
            <Label htmlFor="mcp-address">Other MCP server — by address</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="mcp-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="https://tickets.example.com/mcp"
                aria-invalid={Boolean(error)}
                aria-describedby="mcp-address-hint"
                className="min-w-0 flex-1 basis-56 font-mono"
              />
              <Button type="submit" variant="outline">
                Connect
              </Button>
            </div>
            <p
              id="mcp-address-hint"
              className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}
            >
              {error ??
                "For a service that speaks MCP. You sign in to it in a popup; what it can do shows once you are in, every tool set to ask each time."}
            </p>
          </form>
        </CollapsibleContent>
      </Collapsible>
      <div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </section>
  );
}

export function Connectors({
  variant = "cards",
  connectors: initial = mockConnectors,
  open: initialOpen,
  adding: initialAdding = false,
  address = "",
  revoking: initialRevoking,
  signIn = mockSignIn,
  now = today,
}: ConnectorsProps) {
  const [list, setList] = useState(initial);
  const [open, setOpen] = useState(initialOpen);
  const [adding, setAdding] = useState(initialAdding);
  const [revoking, setRevoking] = useState(initialRevoking);

  const update = (id: string, change: (c: Connector) => Connector) =>
    setList((l) => l.map((c) => (c.id === id ? change(c) : c)));

  const connect = (c: Connector) => {
    update(c.id, (x) => ({ ...x, connecting: true }));
    signIn(c).then((result) =>
      // A cancelled sign-in that completes late is ignored.
      update(c.id, (x) =>
        x.connecting
          ? {
              ...x,
              connecting: false,
              down: undefined,
              signIn: { account: result.account, since: now },
              capabilities: result.capabilities ?? x.capabilities,
            }
          : x,
      ),
    );
  };

  const pick = (c: Connector) => {
    setList((l) => [...l, c]);
    setAdding(false);
    if (variant === "list") setOpen(c.id);
    connect(c);
  };

  const actions = (c: Connector): Actions => ({
    onConnect: () => connect(c),
    onCancel: () => update(c.id, (x) => ({ ...x, connecting: false })),
    onPermission: (id, p) => update(c.id, (x) => setPermission(x, id, p)),
    onRevoke: () => setRevoking(c.id),
    onRemove: () => {
      setList((l) => l.filter((x) => x.id !== c.id));
      setOpen(undefined);
    },
  });

  const toRevoke = list.find((c) => c.id === revoking && c.signIn);
  const effects = toRevoke && revokeEffects(toRevoke);
  const chosen = variant === "list" ? list.find((c) => c.id === open) : undefined;

  return (
    <Card className="w-full max-w-2xl gap-0 py-0">
      {chosen ? (
        <ConnectorPage
          c={chosen}
          now={now}
          onBack={() => setOpen(undefined)}
          {...actions(chosen)}
        />
      ) : (
        <>
          <div className="grid gap-3 border-b p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-auto min-w-0">
                <h2 className="font-semibold">Connectors</h2>
                <p className="text-muted-foreground text-sm">
                  Outside services the assistant can use for you.
                </p>
              </div>
              <Button size="sm" onClick={() => setAdding(true)} disabled={Boolean(adding)}>
                <Plus /> Add a connector
              </Button>
            </div>
            <p className="text-muted-foreground flex gap-2 text-xs">
              <ShieldCheck className="size-4 shrink-0" />
              Your sign-ins are kept in this browser only. They are not shared with the group, and
              your admin does not see them. On another device, connect again.
            </p>
          </div>
          {adding && (
            <AddConnector
              added={new Set(list.map((c) => c.id))}
              advanced={adding === "advanced"}
              address={address}
              onPick={pick}
              onClose={() => setAdding(false)}
            />
          )}
          {list.length === 0 ? (
            <p className="text-muted-foreground p-8 text-center text-sm">
              No connectors yet. The assistant works only with your folder until you add one.
            </p>
          ) : variant === "list" ? (
            <ul>
              {list.map((c) => (
                <ConnectorLine key={c.id} c={c} now={now} onOpen={() => setOpen(c.id)} />
              ))}
            </ul>
          ) : (
            <div className="grid gap-3 p-4">
              {list.map((c) => (
                <ConnectorCard key={c.id} c={c} now={now} {...actions(c)} />
              ))}
            </div>
          )}
        </>
      )}

      <AlertDialog open={Boolean(toRevoke)} onOpenChange={(o) => !o && setRevoking(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {toRevoke?.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="grid gap-2 text-left text-sm">
                <p>
                  Your sign-in as <span className="break-all">{toRevoke?.signIn?.account}</span> is
                  deleted from this browser. The assistant can no longer:
                </p>
                <ul className="list-disc pl-5">
                  {effects?.stops.map((s) => (
                    <li key={s}>{s.charAt(0).toLowerCase() + s.slice(1)}</li>
                  ))}
                </ul>
                <p>What it already did stays:</p>
                <ul className="list-disc pl-5">
                  {effects?.stays.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                  <li>What it saved in your folder (summaries, notes) stays there.</li>
                </ul>
                <p>
                  To cut access on the service's side as well, remove Sandclaw from your account
                  settings there.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => toRevoke && update(toRevoke.id, revoke)}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
