import { listFiles } from "../folder-zone/tree.js";
import { type FolderEntry, folder } from "../mock.js";

// A mock of what the assistant has read in the user's folder. Pure functions over
// a flat list of files; the views call them and keep the result in React state.

/**
 * - `read`: read, and (unless `pendingMeaning`) understood;
 * - `reading`: being read now;
 * - `queued`: waiting to be read;
 * - `changed`: changed since it was read — will be read again;
 * - `excluded`: in a folder the user asked the assistant not to read;
 * - `failed`: the assistant could not read it (see `reason`).
 */
export type FileState = "read" | "reading" | "queued" | "changed" | "excluded" | "failed";

export type FailReason = "password" | "scan" | "too-large" | "format" | "damaged";

export interface IndexFile {
  path: string;
  state: FileState;
  reason?: FailReason;
  /**
   * Read in this browser, but the Sandclaw machine has not understood its meaning
   * yet (the machine was offline).
   */
  pendingMeaning?: boolean;
}

/** Each reason in plain words, and what the user can do about it. */
export const reasons: Record<FailReason, { title: string; hint: string }> = {
  password: {
    title: "Protected by a password",
    hint: "Save a copy without the password, then try again.",
  },
  scan: {
    title: "A scan with no text, only an image of the pages",
    hint: "Run text recognition in your scanner app, then try again.",
  },
  "too-large": {
    title: "Too large (2.3 GB); the assistant reads files up to 200 MB",
    hint: "Move it out of the folder, or keep it: the assistant just won't answer from it.",
  },
  format: {
    title: "A kind of file the assistant can't read yet (a .dwg drawing)",
    hint: "Export it as PDF next to the original.",
  },
  damaged: {
    title: "The file seems damaged and doesn't open",
    hint: "Open it on your computer; if it opens, try again.",
  },
};

/** The files that cannot be read, and why. Reading them again fails the same way. */
export const failures: Record<string, FailReason> = {
  "Clients/contracts/Dupont — signed.pdf": "scan",
  "Clients/Leroy — plans.dwg": "format",
  "Finance/payroll 2026.pdf": "password",
  "Finance/2025 ledger.xlsx": "damaged",
  "Outputs/site visit.mov": "too-large",
};

/** Changed on disk since they were read, in the "with changes" scenarios. */
export const changedPaths = [
  "Clients/Dupont — offer.docx",
  "Finance/2026-Q3.xlsx",
  "Notes/todo.md",
];

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const file = (name: string): FolderEntry => ({ name });
const clientNames = [
  "Dupont",
  "Leroy",
  "Martin",
  "Bernard",
  "Petit",
  "Durand",
  "Moreau",
  "Fournier",
  "Girard",
  "Lambert",
  "Rousseau",
  "Vincent",
];
const clientDocs = [
  "quote.pdf",
  "brief.docx",
  "notes.md",
  "site photos.pdf",
  "invoice.pdf",
  "plan.pdf",
  "emails.txt",
  "schedule.xlsx",
  "report.docx",
  "contract.pdf",
];

/** Extra files per top-level folder, so the numbers look like a real folder. */
const bulk: Record<string, FolderEntry[]> = {
  Clients: [
    file("Leroy — plans.dwg"),
    {
      name: "projects",
      children: range(115).map((i) =>
        file(`${clientNames[i % 12]} — ${clientDocs[Math.floor(i / 12) % 10]}`),
      ),
    },
  ],
  Finance: [
    file("payroll 2026.pdf"),
    file("2025 ledger.xlsx"),
    {
      name: "invoices",
      children: range(76).map((i) => file(`INV-0${335 + i}.pdf`)),
    },
  ],
  Notes: range(34).map((i) =>
    file(`meeting 2026-0${1 + Math.floor(i / 4)}-${String(3 + (i % 4) * 7).padStart(2, "0")}.md`),
  ),
  Outputs: [
    file("site visit.mov"),
    ...range(22).map((i) => file(`summary ${String(i + 1).padStart(2, "0")}.docx`)),
  ],
};

/** Merges `extra` into `entries`: folders with the same name are merged, files appended. */
function merge(entries: FolderEntry[], extra: FolderEntry[]): FolderEntry[] {
  const out = entries.map((e) => ({ ...e }));
  for (const e of extra) {
    const same = out.find((o) => o.name === e.name && o.children && e.children);
    if (same?.children && e.children) same.children = merge(same.children, e.children);
    else out.push(e);
  }
  return out;
}

/** The user's folder with bulk: 340 files in five top-level folders. */
export const atelierFolder: FolderEntry[] = [
  ...folder.map((f) => ({ ...f, children: merge(f.children ?? [], bulk[f.name] ?? []) })),
  { name: "Photos", children: range(80).map((i) => file(`IMG_${2041 + i}.jpg`)) },
];

export const topFolders = atelierFolder.map((f) => f.name);

export const allPaths = listFiles(atelierFolder).map((f) => f.path);

export type Scenario = "first-reading" | "all-read" | "with-failures";

/**
 * - `first-reading`: the first pass is under way, 212 of 340 read;
 * - `all-read`: everything read, nothing failed;
 * - `with-failures`: everything read, five files can't be read, three changed.
 *
 * With `offline`, the last 40 files read are not understood yet.
 */
export function makeFiles(scenario: Scenario, offline = false): IndexFile[] {
  const files: IndexFile[] = allPaths.map((path) => ({ path, state: "read" }));
  if (scenario === "all-read") return files;
  if (scenario === "with-failures") {
    return files.map((f) =>
      failures[f.path]
        ? { ...f, state: "failed", reason: failures[f.path] }
        : changedPaths.includes(f.path)
          ? { ...f, state: "changed" }
          : f,
    );
  }
  // First reading: files are read in tree order; 216 done (4 of them failed), 3 being read.
  let done = files.map((f, i): IndexFile => {
    if (i >= 219) return { ...f, state: "queued" };
    if (i >= 216) return { ...f, state: "reading" };
    const reason = failures[f.path];
    return reason ? { ...f, state: "failed", reason } : f;
  });
  if (offline) {
    let left = 40;
    done = done
      .slice()
      .reverse()
      .map((f) => (f.state === "read" && left-- > 0 ? { ...f, pendingMeaning: true } : f))
      .reverse();
  }
  return done;
}

const under = (path: string, prefix: string) =>
  prefix === "" || path === prefix || path.startsWith(`${prefix}/`);

export interface Counts {
  /** Files the assistant should read: everything but excluded. */
  total: number;
  read: number;
  /** Read, but waiting for the Sandclaw machine to understand them. */
  pendingMeaning: number;
  /** Being read, waiting, or changed: still to do. */
  toGo: number;
  changed: number;
  failed: number;
  excluded: number;
}

/** Counts for every file under `prefix` ("" for the whole folder). */
export function countFiles(files: IndexFile[], prefix = ""): Counts {
  const c: Counts = {
    total: 0,
    read: 0,
    pendingMeaning: 0,
    toGo: 0,
    changed: 0,
    failed: 0,
    excluded: 0,
  };
  for (const f of files) {
    if (!under(f.path, prefix)) continue;
    if (f.state === "excluded") {
      c.excluded++;
      continue;
    }
    c.total++;
    if (f.state === "read") c.read++;
    if (f.pendingMeaning) c.pendingMeaning++;
    if (f.state === "failed") c.failed++;
    if (f.state === "changed") c.changed++;
    if (f.state === "queued" || f.state === "reading" || f.state === "changed") c.toGo++;
  }
  return c;
}

/** Seconds per file, measured on a laptop with the machine online: 340 files ≈ 20 minutes. */
export const SECONDS_PER_FILE = 3.5;

export function minutesFor(files: number): number {
  return Math.ceil((files * SECONDS_PER_FILE) / 60);
}

const map = (files: IndexFile[], prefix: string, fn: (f: IndexFile) => IndexFile) =>
  files.map((f) => (under(f.path, prefix) ? fn(f) : f));

/** The assistant stops reading the folder and forgets what it learnt from it. */
export const exclude = (files: IndexFile[], prefix: string) =>
  map(files, prefix, (f) => ({ path: f.path, state: "excluded" }));

/** The folder is read again from scratch: its files are queued. */
export const include = (files: IndexFile[], prefix: string) =>
  map(files, prefix, (f) => (f.state === "excluded" ? { path: f.path, state: "queued" } : f));

/**
 * Read a file, a folder or (with "") everything again. Excluded files stay
 * excluded; what was read stays usable until it is read again.
 */
export const reread = (files: IndexFile[], prefix: string) =>
  map(files, prefix, (f) => (f.state === "excluded" ? f : { path: f.path, state: "queued" }));

/**
 * One tick of the scripted reader: files being read finish (or fail), the next
 * `n` (changed first, then queued) start. Online, files read earlier get their
 * meaning understood; offline, newly read files wait for the machine.
 */
export function step(files: IndexFile[], n: number, offline: boolean): IndexFile[] {
  let next = files.map((f): IndexFile => {
    if (f.state === "reading") {
      const reason = failures[f.path];
      return reason
        ? { path: f.path, state: "failed", reason }
        : { path: f.path, state: "read", pendingMeaning: offline || undefined };
    }
    return f;
  });
  const order = [
    ...next.filter((f) => f.state === "changed"),
    ...next.filter((f) => f.state === "queued"),
  ]
    .slice(0, n)
    .map((f) => f.path);
  const starting = new Set(order);
  let understood = offline ? 0 : n * 2;
  next = next.map((f) => {
    if (starting.has(f.path)) return { path: f.path, state: "reading" };
    if (f.pendingMeaning && understood-- > 0) return { path: f.path, state: f.state };
    return f;
  });
  return next;
}
