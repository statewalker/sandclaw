// Connectors: the member's own sign-ins to outside services (mail through an MCP
// server, calendar, a drive) that let the assistant, running in this browser, act
// for them. Sign-ins stay in this browser: not shared with the group, not seen by
// the admin. Each connector says what it lets the assistant do, capability by
// capability, and the member picks allowed / ask each time / off for each.

/** What a capability does, which sets its default and the choices offered. */
export type CapabilityKind =
  /** Looks without changing anything: read, search. */
  | "read"
  /** Changes things only the member sees until they act: drafts, saved files. */
  | "write"
  /** Reaches other people: sends mail, sends invitations. */
  | "send"
  /** A tool of an unknown MCP server: nobody has said what it does. */
  | "other";

export type Permission = "allowed" | "ask" | "off";

export interface Capability {
  id: string;
  /** In the member's words: "Read your mail". */
  label: string;
  kind: CapabilityKind;
  permission: Permission;
  /** What its work leaves behind after a revoke: "Drafts it wrote stay in your Drafts folder." */
  leaves?: string;
}

export interface SignIn {
  /** The account the member signed in with. */
  account: string;
  since: Date;
  /** When the service stops accepting this sign-in. */
  expiresAt?: Date;
  lastUsedAt?: Date;
}

export interface Activity {
  text: string;
  at: Date;
}

export type ConnectorKind = "mail" | "calendar" | "drive" | "mcp";

export interface Connector {
  id: string;
  kind: ConnectorKind;
  name: string;
  /** Where it connects: "MCP server at mail.atelier-morel.fr". */
  via: string;
  capabilities: Capability[];
  signIn?: SignIn;
  /** The sign-in popup is open and Sandclaw waits for it. */
  connecting?: boolean;
  /** The service did not answer the last time the assistant tried. */
  down?: { since: Date; error: string };
  /** Newest first. */
  activity?: Activity[];
}

export type ConnectorState = "not-connected" | "connecting" | "connected" | "expired" | "down";

/**
 * Where a connector stands. An expired sign-in wins over a down service: the
 * member can fix the first, and only then can Sandclaw tell whether the service
 * answers.
 */
export function stateOf(c: Connector, now: Date): ConnectorState {
  if (c.connecting) return "connecting";
  if (!c.signIn) return "not-connected";
  if (c.signIn.expiresAt && c.signIn.expiresAt <= now) return "expired";
  if (c.down) return "down";
  return "connected";
}

/** Looking and drafting are allowed; anything that reaches other people, or is unknown, asks. */
export function defaultPermission(kind: CapabilityKind): Permission {
  return kind === "read" || kind === "write" ? "allowed" : "ask";
}

/** Sending can never run unasked: it is "ask each time" or "off". */
export function choicesFor(kind: CapabilityKind): Permission[] {
  return kind === "send" ? ["ask", "off"] : ["allowed", "ask", "off"];
}

/** The connector with one capability changed; a choice the capability does not offer is ignored. */
export function setPermission(c: Connector, capabilityId: string, permission: Permission) {
  return {
    ...c,
    capabilities: c.capabilities.map((cap) =>
      cap.id === capabilityId && choicesFor(cap.kind).includes(permission)
        ? { ...cap, permission }
        : cap,
    ),
  };
}

/** What a revoke stops, and what stays. */
export function revokeEffects(c: Connector) {
  return {
    stops: c.capabilities.filter((cap) => cap.permission !== "off").map((cap) => cap.label),
    stays: c.capabilities.flatMap((cap) => (cap.leaves ? [cap.leaves] : [])),
  };
}

/** Forgets the sign-in; the capability choices are kept for when the member connects again. */
export function revoke(c: Connector): Connector {
  return { ...c, signIn: undefined, down: undefined, connecting: false };
}

const cap = (id: string, label: string, kind: CapabilityKind, leaves?: string): Capability => ({
  id,
  label,
  kind,
  permission: defaultPermission(kind),
  leaves,
});

export interface CatalogEntry {
  kind: ConnectorKind;
  name: string;
  description: string;
  via: string;
  capabilities: Capability[];
}

export const catalog: CatalogEntry[] = [
  {
    kind: "mail",
    name: "Mail",
    description: "Read, search and draft replies in your mailbox.",
    via: "MCP server at mail.atelier-morel.fr",
    capabilities: [
      cap("read", "Read your mail", "read"),
      cap("search", "Search your mail", "read"),
      cap("draft", "Write drafts", "write", "Drafts it wrote stay in your Drafts folder."),
      cap("send", "Send mail", "send"),
    ],
  },
  {
    kind: "calendar",
    name: "Calendar",
    description: "See your agenda and add events to it.",
    via: "calendar.atelier-morel.fr",
    capabilities: [
      cap("read", "See your calendar", "read"),
      cap("write", "Add and move your events", "write", "Events it added stay in your calendar."),
      cap("invite", "Send invitations", "send"),
    ],
  },
  {
    kind: "drive",
    name: "Shared drive",
    description: "Read and save files on the Atelier drive.",
    via: "drive.atelier-morel.fr",
    capabilities: [
      cap("read", "Read files on the drive", "read"),
      cap("write", "Save files to the drive", "write", "Files it saved stay on the drive."),
    ],
  },
];

/** A new connector from the catalog, or from an MCP server's address. */
export function newConnector(entry: CatalogEntry | { address: string }): Connector {
  if ("address" in entry) {
    const host = new URL(entry.address).host;
    return {
      id: `mcp:${host}`,
      kind: "mcp",
      name: host,
      via: `MCP server at ${entry.address}`,
      // Known once signed in: the server lists its tools.
      capabilities: [],
    };
  }
  const { kind, name, via, capabilities } = entry;
  return { id: kind, kind, name, via, capabilities };
}

/** A mistake in an MCP server address, or nothing when it can be used. */
export function validateAddress(text: string): string | undefined {
  const value = text.trim();
  if (!URL.canParse(value)) return "Type the full address, like https://tickets.example.com/mcp.";
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    return "Use an https:// address: your sign-in travels to it.";
  }
  return undefined;
}

/** What a sign-in brings back: the account, and for an unknown MCP server its tools. */
export interface SignInResult {
  account: string;
  capabilities?: Capability[];
}

/** Pretends the member signs in in the popup after a while. */
export function mockSignIn(c: Connector, ms = 2500): Promise<SignInResult> {
  return new Promise((resolve) =>
    setTimeout(
      () =>
        resolve({
          account: c.signIn?.account ?? "ines.garnier@atelier-morel.fr",
          capabilities:
            c.kind === "mcp"
              ? [
                  cap("search_tickets", "search_tickets", "other"),
                  cap("create_ticket", "create_ticket", "other"),
                ]
              : undefined,
        }),
      ms,
    ),
  );
}

const at = (days: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 9, 10 - days, hour, minute));

const [mail, calendar, drive] = catalog.map(newConnector) as [Connector, Connector, Connector];

/** Inès's connectors: mail working, calendar sign-in expired, the drive not answering. */
export const connectors: Connector[] = [
  {
    ...setPermission(mail, "search", "allowed"),
    signIn: {
      account: "ines.garnier@atelier-morel.fr",
      since: at(28, 14),
      lastUsedAt: at(0, 9, 42),
    },
    activity: [
      { text: "Drafted a reply to Mr Dupont", at: at(0, 9, 42) },
      { text: "Searched for “insurance renewal”", at: at(0, 9, 15) },
      { text: "Read 48 messages from last week", at: at(1, 16, 5) },
    ],
  },
  {
    ...calendar,
    signIn: {
      account: "ines.garnier@atelier-morel.fr",
      since: at(95, 10),
      expiresAt: at(3, 0),
      lastUsedAt: at(4, 11, 20),
    },
    activity: [{ text: "Added “Site visit — Leroy” on 14 Oct", at: at(4, 11, 20) }],
  },
  {
    ...drive,
    signIn: {
      account: "ines.garnier@atelier-morel.fr",
      since: at(20, 9),
      lastUsedAt: at(2, 15, 30),
    },
    down: { since: at(0, 9, 30), error: "No answer from drive.atelier-morel.fr" },
  },
];
