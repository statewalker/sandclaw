// Mock data shared by the prototypes. Names and numbers are invented; they only
// need to look like a small company running Sandclaw on one office machine.

export type Role = "admin" | "member";

export interface Colleague {
  name: string;
  email: string;
  role: Role;
  /** Last time the colleague's browser reached the office machine. */
  lastSeen: string;
}

export interface PendingInvite {
  label: string;
  role: Role;
  expires: string;
}

export const officeMachine = {
  name: "Mac Mini — Lyon office",
  model: "Mistral Small 3.2 (24B)",
  owner: "Atelier Morel SARL",
};

export const colleagues: Colleague[] = [
  { name: "Claire Morel", email: "claire@atelier-morel.fr", role: "admin", lastSeen: "now" },
  { name: "Hugo Benali", email: "hugo@atelier-morel.fr", role: "member", lastSeen: "12 min ago" },
  { name: "Inès Garnier", email: "ines@atelier-morel.fr", role: "member", lastSeen: "yesterday" },
];

export const pendingInvites: PendingInvite[] = [
  { label: "Paul (accounting)", role: "member", expires: "in 6 days" },
];

export const inviteLink = "https://app.sandclaw.ai/join#k=7f3a9c2e-office-lyon";

export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

/** The group running Sandclaw: a name chosen at setup, and its admin. */
export const group = {
  name: "Atelier Morel",
  admin: "Claire",
};

export interface FolderEntry {
  name: string;
  children?: FolderEntry[];
}

/** The user's folder: the assistant's working context. */
export const folder: FolderEntry[] = [
  {
    name: "Clients",
    children: [
      { name: "contracts" },
      { name: "Dupont — offer.docx" },
      { name: "Leroy — brief.pdf" },
    ],
  },
  { name: "Finance", children: [{ name: "2026-Q3.xlsx" }, { name: "invoices" }] },
  { name: "Notes", children: [{ name: "todo.md" }, { name: "meeting 2026-10-02.md" }] },
  { name: "Outputs", children: [{ name: "contacts.xlsx" }] },
];

export const todos = [
  { text: "Call Hugo about the Dupont offer", done: false },
  { text: "Send Q3 figures to the accountant", done: false },
  { text: "Renew the insurance contract", done: true },
];
