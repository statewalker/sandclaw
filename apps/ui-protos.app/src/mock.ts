// Mock data shared by the prototypes. Names and numbers are invented; they only
// need to look like a small group running Sandclaw on its own machine.

export type Role = "admin" | "member";

export interface Colleague {
  name: string;
  email: string;
  role: Role;
  /** Last time the colleague's browser reached the Sandclaw machine. */
  lastSeen: string;
}

export interface PendingInvite {
  label: string;
  role: Role;
  expires: string;
}

export const colleagues: Colleague[] = [
  { name: "Claire Morel", email: "claire@atelier-morel.fr", role: "admin", lastSeen: "now" },
  { name: "Hugo Benali", email: "hugo@atelier-morel.fr", role: "member", lastSeen: "12 min ago" },
  { name: "Inès Garnier", email: "ines@atelier-morel.fr", role: "member", lastSeen: "yesterday" },
];

export const pendingInvites: PendingInvite[] = [
  { label: "Paul (accounting)", role: "member", expires: "in 6 days" },
];

export const inviteLink = "https://app.sandclaw.ai/join#k=7f3a9c2e-atelier-morel";

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
  /** Present for folders. */
  children?: FolderEntry[];
  /** Text of a Markdown file, where the prototypes need it (notes, todos). */
  text?: string;
}

/** The user's folder: the assistant's working context. */
export const folder: FolderEntry[] = [
  {
    name: "Clients",
    children: [
      { name: "contracts", children: [{ name: "Dupont — signed.pdf" }] },
      { name: "Dupont — offer.docx" },
      {
        name: "Dupont — notes.md",
        text: "# Dupont\n\n- [ ] Confirm the start date with Mr Dupont\n- [x] Visit the workshop\n",
      },
      { name: "Leroy — brief.pdf" },
    ],
  },
  {
    name: "Finance",
    children: [
      { name: "2026-Q3.xlsx" },
      { name: "invoices", children: [{ name: "INV-0412.pdf" }] },
    ],
  },
  {
    name: "Notes",
    children: [
      {
        name: "todo.md",
        text: "- [ ] Call Hugo about the Dupont offer\n- [ ] Send Q3 figures to the accountant\n- [x] Renew the insurance contract\n",
      },
      {
        name: "meeting 2026-10-02.md",
        text: "# Meeting with Dupont\n\nFollow-ups:\n- [ ] Send Dupont the revised phase 1 schedule\n- [ ] Ask Bois Lyonnais for the beam quote\n",
      },
    ],
  },
  { name: "Outputs", children: [{ name: "contacts.xlsx" }] },
];
