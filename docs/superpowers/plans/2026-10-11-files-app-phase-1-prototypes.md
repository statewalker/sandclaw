# Files app — phase 1: Storybook prototypes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working Storybook prototypes of the Files app — multi-panel file manager (breadcrumb with sibling menus, copy/move by drag and drop or F5/F6, desktop drop, rename/new folder/delete, byte progress) and storage settings (mounts list, S3 form with presets, connection test, vault) — running on real in-memory `FilesApi` storages.

**Architecture:** Two prototype folders in `apps/ui-protos.app/src/`: `file-panels/` and `file-mounts/`. Each has pure logic files (the code that moves into `file-panels.core` / `file-mounts.core` in phase 2), React components, stories and an `.mdx` design note. Storages are `MemFilesApi` instances mounted in a `CompositeFilesApi`; wrappers simulate a slow S3, a failing file and an unavailable mount.

**Tech Stack:** React 19, Storybook 10 (react-vite), Tailwind 4, `@statewalker/ui.view.shadcn` (no Table/Badge/DropdownMenu/Popover/Checkbox: menus are hand-built), lucide-react, `@statewalker/webrun-files` / `-mem` / `-composite` 0.10, vitest + jsdom + @testing-library/react, Biome.

**Spec:** `docs/superpowers/specs/2026-10-11-files-app-design.md` (phases 2–4 get their own plans after phase 1 is reviewed).

## Global Constraints

- App dir: `apps/ui-protos.app` in the worktree `~/sw-migration/work/sandclaw.worktrees/feat-ui-protos`. Node: `export PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH`.
- Kebab-case file names; imports with the `.js` suffix. A logic file must not share its base name with a component file (`x.ts` next to `x.tsx` breaks `./x.js`).
- Never name a React prop `role` (Biome `--unsafe` deletes it).
- Stories: `parameters: { layout: "fullscreen" }` and the decorator `<div className="grid min-h-svh grid-cols-[minmax(0,1fr)] place-items-center p-4">` with the comment copied from `src/browser-data/browser-data.stories.tsx`; everything fits 390 px with no horizontal scroll. The multi-panel stories may use a full-height decorator `<div className="h-svh p-2">` instead (a commander fills the screen); they must still not scroll sideways at 390 px.
- Every stories module is registered in `test/stories.test.tsx`.
- Tests at public seams only: exported logic functions and rendered components. No tests of internals, no tautologies. Tests never wait on real time: use `vi.useFakeTimers()` or a zero delay.
- Plain-language UI copy, as in the spec's *Errors* table (copy those strings verbatim).
- Checks per task: `pnpm test`, `pnpm typecheck`, `pnpm biome check --write --unsafe .`, `pnpm lint:check` (from the app dir). Commit per task with the trailers:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz`.

## Review Focus

1. **Copying a folder into itself or its own subfolder** (drag `/docs` onto `/docs/a`): refused with a message, nothing written — test in Task 3.
2. **Cancel in the middle of a large file** going to the slow S3 mount: stops promptly, the partial target is not left as if complete (removed), the source is untouched, the summary says *Cancelled* — test in Task 4.
3. **Overwrite when the copy then fails** (the failing-file wrapper): the existing target keeps its old content — test in Task 4.
4. **A mount that is unavailable** (locked vault / failed S3) opened in a panel: shows the problem and its action (Unlock / Retry), never an empty folder; Copy to it is refused before any write — tests in Tasks 1 and 6.
5. **Names that clash with themselves** in one batch (dropping `a.txt` from two folders into one target with *keep both*): two distinct names, nothing overwritten — test in Task 3.

---

## File structure

```
apps/ui-protos.app/
  package.json                       + webrun-files, -mem, -composite deps
  src/file-panels/
    demo-storages.ts                 seeded MemFilesApi mounts in a CompositeFilesApi; slow / failing / unavailable wrappers
    problem.ts                       Problem type + MountUnavailable error (shared with file-mounts)
    paths.ts                         breadcrumb(), siblings(), sortEntries(), selection helpers
    transfer-plan.ts                 planTransfer(), freeName(), validateName()
    transfer-run.ts                  runTransfer() with byte progress, cancel, safe overwrite
    dropped-files.ts                 readDropped(DataTransfer) → a MemFilesApi source
    breadcrumb-bar.tsx               the breadcrumb with ▾ sibling menus
    popup-menu.tsx                   a small hand-built menu (no DropdownMenu in the shadcn package)
    file-panel.tsx                   one panel: breadcrumb, toolbar, list, keyboard, drag source/target
    transfer-dialog.tsx              Copy / Move dialog with clash choice
    file-dialogs.tsx                 new folder, rename, delete confirmation
    progress-strip.tsx               transfer progress + summary
    file-commander.tsx               N panels, active panel, F-keys, dialogs, preview tab, phone mode
    file-commander.stories.tsx
    file-commander.mdx
  src/file-mounts/
    mount-config.ts                  MountConfig/MountStatus types, keyFromName, validateKey, S3 presets, validateS3Form
    s3-problems.ts                   classifyS3Error(), corsRule()
    connection-test.ts               runConnectionTest(probe) + fakeProbe(scenario)
    mock-vault.ts                    a vault state machine for the prototype (no crypto)
    mount-form.tsx                   type chooser + S3 form + test results
    vault-dialogs.tsx                create / unlock / change password
    storage-settings.tsx             mounts list with statuses and actions
    storage-settings.stories.tsx
    storage-settings.mdx
  test/
    file-panels-logic.test.ts        Tasks 1–4
    file-panel.test.tsx              Task 5
    file-commander.test.tsx          Task 6
    file-mounts-logic.test.ts        Tasks 7–8
    storage-settings.test.tsx        Task 9
    stories.test.tsx                 + two registrations
```

---

### Task 1: Dependencies, demo storages, Problem

**Files:**
- Modify: `pnpm-workspace.yaml` (catalog: add `"@statewalker/webrun-files-composite": ^0.10.0` next to the other `webrun-files*` lines)
- Modify: `apps/ui-protos.app/package.json` (dependencies: `"@statewalker/webrun-files": "catalog:"`, `"@statewalker/webrun-files-mem": "catalog:"`, `"@statewalker/webrun-files-composite": "catalog:"`)
- Create: `src/file-panels/problem.ts`, `src/file-panels/demo-storages.ts`
- Test: `test/file-panels-logic.test.ts`

**Interfaces:**
- Produces:
  - `type Problem = { cause: ProblemCause; message: string; detail?: string; fix?: { kind: "cors-rule"; json: string } }`, `type ProblemCause = "invalid-settings" | "unreachable" | "cors" | "bad-keys" | "clock-skew" | "no-bucket" | "denied" | "timeout" | "locked" | "needs-access" | "unknown"`
  - `class MountUnavailable extends Error { constructor(readonly mount: string, readonly problem: Problem) }`
  - `interface DemoMount { key: string; name: string; type: "local-folder" | "opfs" | "s3" | "memory"; files: FilesApi; problem?: Problem }`
  - `newDemoStorages(opts?: { slowMs?: number; failPaths?: string[]; unavailable?: Record<string, Problem> }): { files: FilesApi; mounts: DemoMount[] }`
  - `slowFiles(api, msPerChunk)`, `failingFiles(api, paths)`, `unavailableFiles(key, problem)` — each returns a `FilesApi`.

- [ ] **Step 1: add the deps and install**

Edit the two files as listed, then run from the worktree root: `pnpm install`. Expected: lockfile updated, `node_modules/@statewalker/webrun-files-composite` present in the app.

- [ ] **Step 2: write the failing test**

```ts
// test/file-panels-logic.test.ts
import { readText } from "@statewalker/webrun-files";
import { describe, expect, it } from "vitest";
import { newDemoStorages } from "../src/file-panels/demo-storages.js";
import { MountUnavailable } from "../src/file-panels/problem.js";

const names = async (files: import("@statewalker/webrun-files").FilesApi, path: string) => {
  const out: string[] = [];
  for await (const e of files.list(path)) out.push(e.name);
  return out;
};

describe("demo storages", () => {
  it("lists the mounts at the root and reads through them", async () => {
    const { files, mounts } = newDemoStorages();
    expect(mounts.map((m) => m.key)).toEqual(["documents", "browser", "archive", "photos"]);
    expect(await names(files, "/")).toEqual(["archive", "browser", "documents", "photos"]);
    expect(await readText(files, "/documents/notes/todo.md")).toContain("# Todo");
  });

  it("an unavailable mount throws MountUnavailable instead of listing nothing", async () => {
    const { files } = newDemoStorages({
      unavailable: { archive: { cause: "locked", message: "Locked: unlock to use the S3 storages." } },
    });
    await expect(names(files, "/archive")).rejects.toBeInstanceOf(MountUnavailable);
  });
});
```

- [ ] **Step 3: run it — expect FAIL** (`Cannot find module ../src/file-panels/demo-storages.js`): `pnpm vitest --run test/file-panels-logic.test.ts`

- [ ] **Step 4: implement**

```ts
// src/file-panels/problem.ts
/** Why something cannot be used, in words a person reads; `detail` keeps the raw message. */
export type ProblemCause =
  | "invalid-settings" | "unreachable" | "cors" | "bad-keys" | "clock-skew"
  | "no-bucket" | "denied" | "timeout" | "locked" | "needs-access" | "unknown";

export interface Problem {
  cause: ProblemCause;
  message: string;
  detail?: string;
  fix?: { kind: "cors-rule"; json: string };
}

/** Raised by every operation on a mount that is locked, needs access or failed. */
export class MountUnavailable extends Error {
  constructor(
    readonly mount: string,
    readonly problem: Problem,
  ) {
    super(problem.message);
    this.name = "MountUnavailable";
  }
}
```

```ts
// src/file-panels/demo-storages.ts
// The prototype's storages: real in-memory file systems, mounted side by side
// like the app's local folder, browser storage and S3 buckets.
import type { FilesApi, ListOptions, ReadOptions } from "@statewalker/webrun-files";
import { basename, dirname } from "@statewalker/webrun-files";
import { CompositeFilesApi } from "@statewalker/webrun-files-composite";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { MountUnavailable, type Problem } from "./problem.js";

export interface DemoMount {
  key: string;
  name: string;
  type: "local-folder" | "opfs" | "s3" | "memory";
  files: FilesApi;
  problem?: Problem;
}

const MB = 1024 * 1024;
const bytes = (n: number) => new Uint8Array(n).fill(65);

const SEED: Record<string, Record<string, string | Uint8Array>> = {
  documents: {
    "/notes/todo.md": "# Todo\n\n- [ ] Call Dupont\n- [x] Send the offer\n",
    "/notes/meeting-2026-10-02.md": "# Meeting\n\nBudget agreed.\n",
    "/clients/dupont/offer.pdf": bytes(240_000),
    "/clients/dupont/plan.png": bytes(80_000),
    "/clients/martin/contract.docx": bytes(52_000),
    "/clients/martin/notes.md": "# Martin\n",
    "/reports/2026-q3.xlsx": bytes(31_000),
    "/readme.md": "# Documents\n",
  },
  browser: { "/drafts/letter.md": "# Letter\n" },
  archive: {
    "/2025/clients/dupont/offer-2025.pdf": bytes(210_000),
    "/2025/backup.zip": bytes(12 * MB),
    "/2026/readme.md": "# Archive 2026\n",
  },
  photos: { "/site-visit/01.jpg": bytes(1_400_000), "/site-visit/02.jpg": bytes(1_300_000) },
};

const MOUNTS: Omit<DemoMount, "files">[] = [
  { key: "documents", name: "Documents", type: "local-folder" },
  { key: "browser", name: "Browser storage", type: "opfs" },
  { key: "archive", name: "Archive (S3)", type: "s3" },
  { key: "photos", name: "Photos (S3)", type: "s3" },
];

export function newDemoStorages(
  opts: { slowMs?: number; failPaths?: string[]; unavailable?: Record<string, Problem> } = {},
): { files: FilesApi; mounts: DemoMount[] } {
  const root = new CompositeFilesApi(new MemFilesApi());
  const mounts = MOUNTS.map((m) => {
    const problem = opts.unavailable?.[m.key];
    let files: FilesApi = new MemFilesApi({ initialFiles: SEED[m.key] });
    if (m.type === "s3" && opts.slowMs) files = slowFiles(files, opts.slowMs);
    const fails = (opts.failPaths ?? []).filter((p) => p.startsWith(`/${m.key}/`)).map((p) => p.slice(m.key.length + 1));
    if (fails.length) files = failingFiles(files, fails);
    if (problem) files = unavailableFiles(m.key, problem);
    root.mount(`/${m.key}`, files);
    return { ...m, files, problem };
  });
  return { files: root, mounts };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/** Every chunk read or written waits `ms`, and chunks are 256 KB: a visible upload. */
export function slowFiles(api: FilesApi, ms: number): FilesApi {
  return {
    ...bind(api),
    async *read(path: string, options?: ReadOptions) {
      for await (const chunk of api.read(path, options)) {
        for (let i = 0; i < chunk.length; i += 256 * 1024) {
          await sleep(ms, options?.signal);
          yield chunk.subarray(i, i + 256 * 1024);
        }
      }
    },
    async write(path, content) {
      async function* paced() {
        for await (const chunk of content) {
          await sleep(ms);
          yield chunk;
        }
      }
      return api.write(path, paced());
    },
  };
}

/**
 * Writing one of `paths` fails after consuming its content, like a dropped
 * connection. A temporary `.name.part-…` beside it fails too, so an overwrite
 * (written to a temporary name first) fails the same way.
 */
export function failingFiles(api: FilesApi, paths: string[]): FilesApi {
  const fails = (path: string) =>
    paths.some(
      (p) => p === path || (dirname(p) === dirname(path) && basename(path).startsWith(`.${basename(p)}.part-`)),
    );
  return {
    ...bind(api),
    async write(path, content) {
      if (!fails(path)) return api.write(path, content);
      for await (const _ of content) {
        /* drain, then fail */
      }
      throw new Error("Network error: the connection was reset.");
    },
  };
}

/** A mount that cannot be used: every operation raises its problem. */
export function unavailableFiles(key: string, problem: Problem): FilesApi {
  const fail = () => {
    throw new MountUnavailable(key, problem);
  };
  return {
    // biome-ignore lint/correctness/useYield: it only throws
    async *read() {
      fail();
    },
    // biome-ignore lint/correctness/useYield: it only throws
    async *list(_path: string, _options?: ListOptions) {
      fail();
    },
    write: async () => fail(),
    mkdir: async () => fail(),
    stats: async () => fail(),
    exists: async () => fail(),
    remove: async () => fail(),
    move: async () => fail(),
    copy: async () => fail(),
  };
}

function bind(api: FilesApi): FilesApi {
  return {
    read: (p, o) => api.read(p, o),
    write: (p, c) => api.write(p, c),
    mkdir: (p) => api.mkdir(p),
    list: (p, o) => api.list(p, o),
    stats: (p) => api.stats(p),
    exists: (p) => api.exists(p),
    remove: (p) => api.remove(p),
    move: (a, b) => api.move(a, b),
    copy: (a, b) => api.copy(a, b),
  };
}
```

If Biome rejects the `biome-ignore` comments' rule name, use the name it reports. `failingFiles` receives mount-relative paths (the composite strips `/<key>`); `failPaths` are given as workspace paths, hence the `slice`. Overwrites are written to `.<name>.part-<random>` beside the target (Task 4), which is why `failingFiles` matches that name too.

- [ ] **Step 5: run — expect PASS**; then typecheck and lint.
- [ ] **Step 6: commit** `feat(ui-protos.app): Files app prototype — demo storages over CompositeFilesApi`

---

### Task 2: Breadcrumb, siblings, sorting, selection

**Files:**
- Create: `src/file-panels/paths.ts`
- Test: `test/file-panels-logic.test.ts` (append)

**Interfaces:**
- Consumes: `newDemoStorages`, `MountUnavailable` (Task 1).
- Produces:
  - `interface Crumb { name: string; path: string; isMount: boolean }`
  - `breadcrumb(path: string, mountNames: Record<string, string>): Crumb[]` — first crumb is the mount (display name), `"/"` gives `[]`.
  - `siblings(files: FilesApi, crumb: Crumb): Promise<{ name: string; path: string }[]>` — folders in the crumb's parent, sorted by name (locale, numeric); for a mount crumb, the mounts.
  - `type SortField = "name" | "size" | "lastModified"`, `interface Sort { field: SortField; descending: boolean }`
  - `sortEntries(entries: FileInfo[], sort: Sort): FileInfo[]` — folders first, `Intl.Collator(undefined, { numeric: true, sensitivity: "base" })`.
  - `clickSelect(selected: string[], anchor: string | undefined, order: string[], path: string, mods: { shift: boolean; ctrl: boolean }): { selected: string[]; anchor: string }`.

- [ ] **Step 1: failing tests**

```ts
import { breadcrumb, clickSelect, siblings, sortEntries } from "../src/file-panels/paths.js";

describe("breadcrumb and siblings", () => {
  const mountNames = { documents: "Documents", archive: "Archive (S3)" };

  it("names the mount first, then one crumb per folder", () => {
    expect(breadcrumb("/documents/clients/dupont", mountNames)).toEqual([
      { name: "Documents", path: "/documents", isMount: true },
      { name: "clients", path: "/documents/clients", isMount: false },
      { name: "dupont", path: "/documents/clients/dupont", isMount: false },
    ]);
    expect(breadcrumb("/", mountNames)).toEqual([]);
  });

  it("lists the folders beside a crumb, and the mounts beside a mount", async () => {
    const { files } = newDemoStorages();
    const crumbs = breadcrumb("/documents/clients/dupont", mountNames);
    expect(await siblings(files, crumbs[2]!)).toEqual([
      { name: "dupont", path: "/documents/clients/dupont" },
      { name: "martin", path: "/documents/clients/martin" },
    ]);
    expect((await siblings(files, crumbs[0]!)).map((s) => s.name)).toEqual([
      "archive", "browser", "documents", "photos",
    ]);
  });
});

describe("sorting and selection", () => {
  const f = (name: string, size = 0, lastModified = 0) => ({ kind: "file" as const, name, path: `/${name}`, size, lastModified });
  const d = (name: string) => ({ kind: "directory" as const, name, path: `/${name}` });

  it("puts folders first and sorts numbers naturally", () => {
    const out = sortEntries([f("file10"), d("z"), f("file2"), d("a")], { field: "name", descending: false });
    expect(out.map((e) => e.name)).toEqual(["a", "z", "file2", "file10"]);
  });

  it("sorts by size descending, folders still first", () => {
    const out = sortEntries([f("s", 1), d("x"), f("b", 9)], { field: "size", descending: true });
    expect(out.map((e) => e.name)).toEqual(["x", "b", "s"]);
  });

  it("click selects one, ctrl toggles, shift extends from the anchor", () => {
    const order = ["/a", "/b", "/c", "/d"];
    let s = clickSelect([], undefined, order, "/b", { shift: false, ctrl: false });
    expect(s.selected).toEqual(["/b"]);
    s = clickSelect(s.selected, s.anchor, order, "/d", { shift: true, ctrl: false });
    expect(s.selected).toEqual(["/b", "/c", "/d"]);
    s = clickSelect(s.selected, s.anchor, order, "/c", { shift: false, ctrl: true });
    expect(s.selected).toEqual(["/b", "/d"]);
  });
});
```

- [ ] **Step 2: run — FAIL** (module not found).
- [ ] **Step 3: implement**

```ts
// src/file-panels/paths.ts
import type { FileInfo, FilesApi } from "@statewalker/webrun-files";
import { dirname } from "@statewalker/webrun-files";

export interface Crumb {
  name: string;
  path: string;
  isMount: boolean;
}

export function breadcrumb(path: string, mountNames: Record<string, string>): Crumb[] {
  const parts = path.split("/").filter(Boolean);
  return parts.map((part, i) => ({
    name: i === 0 ? (mountNames[part] ?? part) : part,
    path: `/${parts.slice(0, i + 1).join("/")}`,
    isMount: i === 0,
  }));
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** The folders beside a crumb: the ▾ menu. Beside a mount are the other mounts. */
export async function siblings(files: FilesApi, crumb: Crumb): Promise<{ name: string; path: string }[]> {
  const out: { name: string; path: string }[] = [];
  for await (const e of files.list(dirname(crumb.path))) {
    if (e.kind === "directory") out.push({ name: e.name, path: e.path });
  }
  return out.sort((a, b) => collator.compare(a.name, b.name));
}

export type SortField = "name" | "size" | "lastModified";
export interface Sort {
  field: SortField;
  descending: boolean;
}

export function sortEntries(entries: FileInfo[], sort: Sort): FileInfo[] {
  const value = (e: FileInfo) => (e.kind === "file" ? (sort.field === "size" ? e.size : e.lastModified) : 0);
  const byField = (a: FileInfo, b: FileInfo) =>
    sort.field === "name" ? collator.compare(a.name, b.name) : value(a) - value(b) || collator.compare(a.name, b.name);
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return sort.descending ? byField(b, a) : byField(a, b);
  });
}

export function clickSelect(
  selected: string[],
  anchor: string | undefined,
  order: string[],
  path: string,
  mods: { shift: boolean; ctrl: boolean },
): { selected: string[]; anchor: string } {
  if (mods.shift && anchor) {
    const [a, b] = [order.indexOf(anchor), order.indexOf(path)].sort((x, y) => x - y);
    return { selected: order.slice(a, (b ?? a) + 1), anchor };
  }
  if (mods.ctrl) {
    const next = selected.includes(path) ? selected.filter((p) => p !== path) : [...selected, path];
    return { selected: order.filter((p) => next.includes(p)), anchor: path };
  }
  return { selected: [path], anchor: path };
}
```

Note: the mount names for the ▾ list of a mount crumb are keys here (`archive`…); the component maps them to display names.

- [ ] **Step 4: run — PASS**; typecheck, lint.
- [ ] **Step 5: commit** `feat(ui-protos.app): Files app prototype — breadcrumb siblings, sorting, selection`

---

### Task 3: Transfer planning

**Files:**
- Create: `src/file-panels/transfer-plan.ts`
- Test: `test/file-panels-logic.test.ts` (append)

**Interfaces:**
- Consumes: `FilesApi`; `newDemoStorages` in tests.
- Produces:
  - `type TransferOp = "copy" | "move"`, `type ClashPolicy = "overwrite" | "keep-both" | "skip"`
  - `interface TransferRequest { op: TransferOp; sources: string[]; targetDir: string; rename?: string; clash: ClashPolicy }`
  - `interface TransferStep { op: TransferOp; from: string; to: string; overwrite: boolean }`
  - `interface TransferPlan { steps: TransferStep[]; skipped: string[]; clashes: string[]; invalid?: string }`
  - `planTransfer(files: FilesApi, req: TransferRequest): Promise<TransferPlan>`
  - `findClashes(files, sources, targetDir): Promise<string[]>` (names that already exist in the target — the dialog uses it before the choice)
  - `freeName(name: string, taken: Set<string>): string` — `a.md` → `a copy.md` → `a copy 2.md`; folders `x` → `x copy`.
  - `validateName(name: string): string | undefined` — returns the message, or undefined when valid: empty → "Enter a name."; contains `/` or `\` → "A name can't contain / or \\."; `.` or `..` → "This name is reserved."

- [ ] **Step 1: failing tests**

```ts
import { findClashes, freeName, planTransfer, validateName } from "../src/file-panels/transfer-plan.js";

describe("planTransfer", () => {
  it("refuses a folder into itself or below it", async () => {
    const { files } = newDemoStorages();
    const plan = await planTransfer(files, { op: "move", sources: ["/documents/clients"], targetDir: "/documents/clients/dupont", clash: "skip" });
    expect(plan.invalid).toBe("A folder can't be copied or moved into itself.");
    expect(plan.steps).toEqual([]);
  });

  it("dropping into the source's own folder copies under a free name", async () => {
    const { files } = newDemoStorages();
    const plan = await planTransfer(files, { op: "move", sources: ["/documents/readme.md"], targetDir: "/documents", clash: "skip" });
    expect(plan.steps).toEqual([{ op: "copy", from: "/documents/readme.md", to: "/documents/readme copy.md", overwrite: false }]);
  });

  it("applies the clash policy: skip, overwrite, keep both", async () => {
    const { files } = newDemoStorages();
    await files.write("/archive/2026/todo.md", [new TextEncoder().encode("old")]);
    const req = { op: "copy" as const, sources: ["/documents/notes/todo.md"], targetDir: "/archive/2026" };
    expect(await findClashes(files, req.sources, req.targetDir)).toEqual(["todo.md"]);
    expect((await planTransfer(files, { ...req, clash: "skip" })).skipped).toEqual(["/documents/notes/todo.md"]);
    expect((await planTransfer(files, { ...req, clash: "overwrite" })).steps[0]).toMatchObject({ to: "/archive/2026/todo.md", overwrite: true });
    expect((await planTransfer(files, { ...req, clash: "keep-both" })).steps[0]).toMatchObject({ to: "/archive/2026/todo copy.md", overwrite: false });
  });

  it("two sources with the same name never overwrite each other", async () => {
    const { files } = newDemoStorages();
    const plan = await planTransfer(files, {
      op: "copy", sources: ["/documents/readme.md", "/archive/2026/readme.md"], targetDir: "/browser", clash: "keep-both",
    });
    expect(plan.steps.map((s) => s.to)).toEqual(["/browser/readme.md", "/browser/readme copy.md"]);
  });

  it("a single source can be renamed", async () => {
    const { files } = newDemoStorages();
    const plan = await planTransfer(files, { op: "copy", sources: ["/documents/readme.md"], targetDir: "/browser", rename: "intro.md", clash: "skip" });
    expect(plan.steps[0]?.to).toBe("/browser/intro.md");
  });
});

describe("names", () => {
  it("frees a name", () => {
    expect(freeName("a.md", new Set(["a.md"]))).toBe("a copy.md");
    expect(freeName("a.md", new Set(["a.md", "a copy.md"]))).toBe("a copy 2.md");
    expect(freeName("folder", new Set(["folder"]))).toBe("folder copy");
  });
  it("validates a name", () => {
    expect(validateName("")).toBe("Enter a name.");
    expect(validateName("a/b")).toBe("A name can't contain / or \\.");
    expect(validateName("..")).toBe("This name is reserved.");
    expect(validateName("ok.md")).toBeUndefined();
  });
});
```

- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: implement**

```ts
// src/file-panels/transfer-plan.ts
// What a copy or move will do, decided before anything is written: the
// dialog shows the clashes, the runner executes the steps.
import type { FilesApi } from "@statewalker/webrun-files";
import { basename, dirname, extname, joinPath } from "@statewalker/webrun-files";

export type TransferOp = "copy" | "move";
export type ClashPolicy = "overwrite" | "keep-both" | "skip";

export interface TransferRequest {
  op: TransferOp;
  sources: string[];
  targetDir: string;
  rename?: string;
  clash: ClashPolicy;
}
export interface TransferStep {
  op: TransferOp;
  from: string;
  to: string;
  overwrite: boolean;
}
export interface TransferPlan {
  steps: TransferStep[];
  skipped: string[];
  clashes: string[];
  invalid?: string;
}

async function namesIn(files: FilesApi, dir: string): Promise<Set<string>> {
  const names = new Set<string>();
  for await (const e of files.list(dir)) names.add(e.name);
  return names;
}

export async function findClashes(files: FilesApi, sources: string[], targetDir: string): Promise<string[]> {
  const taken = await namesIn(files, targetDir);
  return sources.filter((s) => dirname(s) !== targetDir && taken.has(basename(s))).map((s) => basename(s));
}

export async function planTransfer(files: FilesApi, req: TransferRequest): Promise<TransferPlan> {
  const into = (s: string) => req.targetDir === s || req.targetDir.startsWith(`${s}/`);
  if (req.sources.some(into)) {
    return { steps: [], skipped: [], clashes: [], invalid: "A folder can't be copied or moved into itself." };
  }
  const existing = await namesIn(files, req.targetDir);
  const planned = new Set<string>();
  const plan: TransferPlan = { steps: [], skipped: [], clashes: [] };
  for (const from of req.sources) {
    let name = (req.sources.length === 1 && req.rename) || basename(from);
    let op = req.op;
    let overwrite = false;
    if (dirname(from) === req.targetDir && name === basename(from)) {
      // Dropped where it already is: the only useful meaning is a copy beside it.
      op = "copy";
      name = freeName(name, new Set([...existing, ...planned]));
    } else if (planned.has(name)) {
      name = freeName(name, new Set([...existing, ...planned]));
    } else if (existing.has(name)) {
      plan.clashes.push(name);
      if (req.clash === "skip") {
        plan.skipped.push(from);
        continue;
      }
      if (req.clash === "keep-both") name = freeName(name, new Set([...existing, ...planned]));
      else overwrite = true;
    }
    planned.add(name);
    plan.steps.push({ op, from, to: joinPath(req.targetDir, name), overwrite });
  }
  return plan;
}

export function freeName(name: string, taken: Set<string>): string {
  const ext = extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let i = 1; ; i++) {
    const candidate = `${stem} copy${i === 1 ? "" : ` ${i}`}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function validateName(name: string): string | undefined {
  if (!name.trim()) return "Enter a name.";
  if (/[/\\]/.test(name)) return "A name can't contain / or \\.";
  if (name === "." || name === "..") return "This name is reserved.";
  return undefined;
}
```

Check `extname("folder")` returns `""` and `extname("a.md")` returns `".md"` in `@statewalker/webrun-files`; if it differs, adapt `freeName` and keep the tests.

- [ ] **Step 4: run — PASS**; typecheck, lint.
- [ ] **Step 5: commit** `feat(ui-protos.app): Files app prototype — transfer planning with clash policies`

---

### Task 4: Running a transfer

**Files:**
- Create: `src/file-panels/transfer-run.ts`
- Test: `test/file-panels-logic.test.ts` (append)

**Interfaces:**
- Consumes: `TransferPlan`, `TransferStep` (Task 3); `MountUnavailable`, `Problem` (Task 1).
- Produces:
  - `interface TransferProgress { file: string; bytesDone: number; bytesTotal: number; itemsDone: number; itemsTotal: number }`
  - `interface TransferResult { done: string[]; skipped: string[]; failed: { path: string; problem: Problem }[]; cancelled: boolean }`
  - `runTransfer(files: FilesApi, plan: TransferPlan, opts?: { signal?: AbortSignal; onProgress?: (p: TransferProgress) => void; mountOf?: (path: string) => string }): Promise<TransferResult>`
  - `problemOf(error: unknown): Problem` — `MountUnavailable` → its problem; otherwise `{ cause: "unknown", message: <error message> }`.

Behaviour (all from the spec's *Transfers and operations*):
- Bytes total = sum of file sizes under every step's `from` (walk with `list(from, { recursive: true })` for folders).
- Same mount (`mountOf(from) === mountOf(to)`, default: first path segment): use `files.copy` / `files.move` and count the bytes as done at once.
- Across mounts: for each file, stream `files.read(src, { signal })` into `files.write(tmp, …)` where `tmp` is the target path itself when `!overwrite`, and `${dir}/.${name}.part-<random>` when `overwrite`; on success with overwrite, `files.move(tmp, target)`; the old target is replaced only by a completed copy. Report progress per chunk.
- Move across mounts: remove the source only after every file of the step copied.
- On abort: stop reading, remove the incomplete target or temp file, mark `cancelled: true`, leave the remaining steps undone (not failed).
- A failing step goes to `failed` with `problemOf(error)`; its partial target or temp file is removed; the next step runs.

- [ ] **Step 1: failing tests**

```ts
import { readText } from "@statewalker/webrun-files";
import { planTransfer } from "../src/file-panels/transfer-plan.js";
import { runTransfer } from "../src/file-panels/transfer-run.js";

describe("runTransfer", () => {
  it("copies across mounts with byte progress", async () => {
    const { files } = newDemoStorages();
    const plan = await planTransfer(files, { op: "copy", sources: ["/documents/clients/dupont"], targetDir: "/archive/2026", clash: "skip" });
    const seen: number[] = [];
    const result = await runTransfer(files, plan, { onProgress: (p) => seen.push(p.bytesDone) });
    expect(result).toMatchObject({ done: ["/documents/clients/dupont"], failed: [], cancelled: false });
    expect(await files.exists("/archive/2026/dupont/offer.pdf")).toBe(true);
    expect(seen.at(-1)).toBe(240_000 + 80_000);
  });

  it("a cross-mount move removes the source only after the copy", async () => {
    const { files } = newDemoStorages();
    const plan = await planTransfer(files, { op: "move", sources: ["/documents/readme.md"], targetDir: "/archive", clash: "skip" });
    await runTransfer(files, plan);
    expect(await files.exists("/documents/readme.md")).toBe(false);
    expect(await readText(files, "/archive/readme.md")).toBe("# Documents\n");
  });

  it("an overwrite whose copy fails keeps the old target", async () => {
    const { files } = newDemoStorages({ failPaths: ["/archive/2026/readme.md"] });
    const plan = await planTransfer(files, { op: "copy", sources: ["/documents/readme.md"], targetDir: "/archive/2026", clash: "overwrite" });
    const result = await runTransfer(files, plan);
    expect(result.failed[0]?.problem.message).toContain("connection was reset");
    expect(await readText(files, "/archive/2026/readme.md")).toBe("# Archive 2026\n");
  });

  it("cancelling mid-file removes the partial copy and keeps the source", async () => {
    vi.useFakeTimers();
    const { files } = newDemoStorages({ slowMs: 100 });
    const plan = await planTransfer(files, { op: "move", sources: ["/archive/2025/backup.zip"], targetDir: "/documents", clash: "skip" });
    const controller = new AbortController();
    const running = runTransfer(files, plan, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(250);
    controller.abort();
    await vi.runAllTimersAsync();
    const result = await running;
    vi.useRealTimers();
    expect(result.cancelled).toBe(true);
    expect(await files.exists("/documents/backup.zip")).toBe(false);
    expect(await files.exists("/archive/2025/backup.zip")).toBe(true);
  });

  it("an unavailable target fails each step with the mount's problem", async () => {
    const locked = { cause: "locked" as const, message: "Locked: unlock to use the S3 storages." };
    const { files } = newDemoStorages({ unavailable: { archive: locked } });
    const plan = { steps: [{ op: "copy" as const, from: "/documents/readme.md", to: "/archive/readme.md", overwrite: false }], skipped: [], clashes: [] };
    const result = await runTransfer(files, plan);
    expect(result.failed).toEqual([{ path: "/documents/readme.md", problem: locked }]);
  });
});
```

(add `vi` to the vitest import at the top of the file.)

- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: implement** `src/file-panels/transfer-run.ts` following the behaviour list above. Skeleton with the exact exported names:

```ts
import type { FilesApi } from "@statewalker/webrun-files";
import { basename, dirname, joinPath } from "@statewalker/webrun-files";
import { MountUnavailable, type Problem } from "./problem.js";
import type { TransferPlan, TransferStep } from "./transfer-plan.js";

export interface TransferProgress { file: string; bytesDone: number; bytesTotal: number; itemsDone: number; itemsTotal: number }
export interface TransferResult { done: string[]; skipped: string[]; failed: { path: string; problem: Problem }[]; cancelled: boolean }

export function problemOf(error: unknown): Problem {
  if (error instanceof MountUnavailable) return error.problem;
  return { cause: "unknown", message: error instanceof Error ? error.message : String(error) };
}

const firstSegment = (path: string) => path.split("/")[1] ?? "";

/** Each file of a step: [source, target]; a file step is itself. */
async function filesOf(files: FilesApi, step: TransferStep): Promise<{ from: string; to: string; size: number }[]> {
  const stats = await files.stats(step.from);
  if (!stats) throw new Error(`${basename(step.from)} no longer exists.`);
  if (stats.kind === "file") return [{ from: step.from, to: step.to, size: stats.size }];
  const out: { from: string; to: string; size: number }[] = [];
  for await (const e of files.list(step.from, { recursive: true })) {
    if (e.kind === "file") out.push({ from: e.path, to: joinPath(step.to, e.path.slice(step.from.length)), size: e.size });
  }
  return out;
}

export async function runTransfer(
  files: FilesApi,
  plan: TransferPlan,
  opts: { signal?: AbortSignal; onProgress?: (p: TransferProgress) => void; mountOf?: (path: string) => string } = {},
): Promise<TransferResult> {
  const mountOf = opts.mountOf ?? firstSegment;
  const result: TransferResult = { done: [], skipped: [...plan.skipped], failed: [], cancelled: false };
  // 1. sizes: collect filesOf() per step (a step whose stats fail goes to failed now)
  // 2. per step: same mount → files.copy/move, add its bytes; else per file stream with a temp name when overwrite
  // 3. abort → remove the incomplete file, cancelled = true, return
  // 4. errors → failed.push({ path: step.from, problem: problemOf(e) }), remove the partial file, continue
  // ... (implement exactly as the behaviour list says)
  return result;
}
```

Write the full body; the numbered comments are the order of the code, not placeholders to leave in. For an empty folder step across mounts, `mkdir(step.to)`. Count `itemsDone` per step.

- [ ] **Step 4: run — PASS** (all five); typecheck, lint.
- [ ] **Step 5: commit** `feat(ui-protos.app): Files app prototype — transfers with byte progress, cancel and safe overwrite`

---

### Task 5: One file panel

**Files:**
- Create: `src/file-panels/popup-menu.tsx`, `src/file-panels/breadcrumb-bar.tsx`, `src/file-panels/file-panel.tsx`
- Test: `test/file-panel.test.tsx`

**Interfaces:**
- Consumes: `breadcrumb`, `siblings`, `sortEntries`, `clickSelect`, `Sort`, `Crumb` (Task 2); `MountUnavailable`, `Problem` (Task 1); `DemoMount` for names/status.
- Produces:
  - `PopupMenu({ label, trigger, items: { label: string; hint?: string; onSelect(): void; disabled?: boolean }[] })` — a button that opens a list below it (`role="menu"` on the list, `role="menuitem"` on items), closes on Escape, outside click or choice; arrow keys move between items.
  - `BreadcrumbBar({ files, path, mountNames, onNavigate, onDropOn? })` — crumbs as buttons; each crumb is followed by a ▾ `PopupMenu` (`aria-label="Folders beside <name>"`) filled by `siblings()` on open; the current sibling is marked `aria-current`. A leading "All storages" crumb (`aria-label="All storages"`) navigates to `/`. Crumbs accept drops (`onDropOn(path, event)`).
  - `FilePanel(props: FilePanelProps)`:

```ts
export interface PanelHandle { path: string; selected: string[] }
export interface FilePanelProps {
  files: FilesApi;
  mounts: DemoMount[];                 // names and per-mount problems
  path: string;
  onNavigate(path: string): void;
  active?: boolean;
  onActivate?(): void;
  selected: string[];
  onSelect(selected: string[]): void;
  refreshKey?: number;                 // bump to re-list
  onOpenFile?(path: string): void;
  onCommand?(command: PanelCommand, panel: PanelHandle): void;
  onDropPaths?(paths: string[], targetDir: string, copyPreferred: boolean): void;   // from another panel
  onDropExternal?(data: DataTransfer, targetDir: string): void;                     // from the desktop
  onProblemAction?(mount: string, problem: Problem): void;                          // Unlock / Reconnect / Retry
}
export type PanelCommand = "copy" | "move" | "mkdir" | "rename" | "delete" | "download" | "copy-path" | "open-in-new-panel";
```

Behaviour:
- Lists `path` (at `/`: the mounts, with their display names and a problem icon on unavailable ones), sorted with `sortEntries`; column headers Name / Size / Modified are buttons toggling the sort (`aria-sort`). Rows are `role="row"` inside `role="grid"` with `aria-selected`.
- A listing that throws shows the problem: `MountUnavailable` → its `message` and an action button labelled by cause: `locked` → "Unlock", `needs-access` → "Reconnect", otherwise "Retry"; other errors → "This folder can't be read: <message>" + Retry. Never an empty list.
- Toolbar: Up (disabled at `/`), Refresh, New folder (`onCommand("mkdir")`), a filter box (case-insensitive substring on the name).
- Status line: `N items` · when selected: `K selected · <size>`.
- Click / Shift / Ctrl via `clickSelect`; double-click or Enter opens (folder → `onNavigate`, file → `onOpenFile`).
- Keys when the grid has focus: ↑/↓ move the cursor (and select it), Shift+↑/↓ extend, Ctrl+A all, Enter open, Backspace up, F2 rename, F5 copy, F6 move, F7 mkdir, F8 and Delete delete. A printable key focuses the filter box with that character.
- Row context menu (right click): Open, Open in new panel (folders), Copy to…, Move to…, Rename, Delete, Download (files), Copy path → `onCommand`.
- Drag source: rows set `application/x-sandclaw-paths` (JSON array: the selection if the row is in it, else the row) and `effectAllowed = "copyMove"`.
- Drop target: folder rows, the empty list area (target = `path`) and crumbs. Internal drag → `onDropPaths(paths, targetDir, e.ctrlKey || e.altKey)`; `Files` in `dataTransfer.types` → `onDropExternal`. Highlight the target while dragging over it. At `/` the list area refuses drops.

- [ ] **Step 1: failing tests** (`test/file-panel.test.tsx`)

```tsx
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newDemoStorages } from "../src/file-panels/demo-storages.js";
import { FilePanel, type FilePanelProps } from "../src/file-panels/file-panel.js";

afterEach(cleanup);

function Harness(props: Partial<FilePanelProps> & { start?: string; storages?: ReturnType<typeof newDemoStorages> }) {
  const storages = props.storages ?? newDemoStorages();
  const [path, setPath] = useState(props.start ?? "/documents");
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <FilePanel files={storages.files} mounts={storages.mounts} path={path} onNavigate={setPath}
      selected={selected} onSelect={setSelected} {...props} />
  );
}

const rows = async () => (await screen.findAllByRole("row")).map((r) => r.getAttribute("data-name"));

describe("FilePanel", () => {
  it("lists folders first and opens a folder", async () => {
    render(<Harness />);
    expect(await rows()).toEqual(["clients", "notes", "reports", "readme.md"]);
    fireEvent.doubleClick(screen.getByRole("row", { name: /clients/ }));
    expect(await rows()).toEqual(["dupont", "martin"]);
  });

  it("the breadcrumb menu lists the folders beside a crumb and navigates", async () => {
    render(<Harness start="/documents/clients/dupont" />);
    fireEvent.click(await screen.findByRole("button", { name: "Folders beside dupont" }));
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "martin" }));
    expect(await rows()).toEqual(["contract.docx", "notes.md"]);
  });

  it("the first crumb's menu lists the mounts by name", async () => {
    render(<Harness start="/documents/notes" />);
    fireEvent.click(await screen.findByRole("button", { name: "Folders beside Documents" }));
    const items = within(await screen.findByRole("menu")).getAllByRole("menuitem").map((i) => i.textContent);
    expect(items).toEqual(["Archive (S3)", "Browser storage", "Documents", "Photos (S3)"]);
  });

  it("shows a locked mount's problem with Unlock, not an empty folder", async () => {
    const onProblemAction = vi.fn();
    const storages = newDemoStorages({ unavailable: { archive: { cause: "locked", message: "Locked: unlock to use the S3 storages." } } });
    render(<Harness storages={storages} start="/archive" onProblemAction={onProblemAction} />);
    expect(await screen.findByText("Locked: unlock to use the S3 storages.")).toBeTruthy();
    expect(screen.queryAllByRole("row")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(onProblemAction).toHaveBeenCalledWith("archive", expect.objectContaining({ cause: "locked" }));
  });

  it("keys: shift+arrow extends the selection, F5 asks to copy it", async () => {
    const onCommand = vi.fn();
    render(<Harness onCommand={onCommand} />);
    await rows();
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(grid, { key: "F5" });
    expect(onCommand).toHaveBeenCalledWith("copy", { path: "/documents", selected: ["/documents/clients", "/documents/notes"] });
  });

  it("a drop from another panel reports the paths, the target and the copy modifier", async () => {
    const onDropPaths = vi.fn();
    render(<Harness onDropPaths={onDropPaths} />);
    const target = await screen.findByRole("row", { name: /notes/ });
    const data = { types: ["application/x-sandclaw-paths"], getData: () => JSON.stringify(["/archive/2026/readme.md"]) };
    fireEvent.drop(target, { dataTransfer: data, ctrlKey: true });
    expect(onDropPaths).toHaveBeenCalledWith(["/archive/2026/readme.md"], "/documents/notes", true);
  });
});
```

- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: implement the three components** to the behaviour above. Row accessible name: the entry name (put `aria-label={name}` on the row). Use `Button`, `Input` from `@statewalker/ui.view.shadcn`, lucide icons (`Folder`, `FileText`, `HardDrive`, `Cloud`, `Globe`, `ChevronDown`, `ArrowUp`, `RefreshCw`, `FolderPlus`, `Lock`, `TriangleAlert`). Sizes formatted like `240 KB`, `12 MB`; dates `2 Oct 2026`. The list scrolls vertically inside the panel; long names truncate.
- [ ] **Step 4: run — PASS**; typecheck, lint.
- [ ] **Step 5: commit** `feat(ui-protos.app): Files app prototype — a file panel with breadcrumb sibling menus, keyboard and drag and drop`

---

### Task 6: The commander: panels, dialogs, progress, stories

**Files:**
- Create: `src/file-panels/transfer-dialog.tsx`, `src/file-panels/file-dialogs.tsx`, `src/file-panels/progress-strip.tsx`, `src/file-panels/dropped-files.ts`, `src/file-panels/file-commander.tsx`, `src/file-panels/file-commander.stories.tsx`, `src/file-panels/file-commander.mdx`
- Modify: `test/stories.test.tsx` (register `file-commander.stories.js`)
- Test: `test/file-commander.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `readDropped(data: DataTransfer): Promise<{ files: FilesApi; paths: string[] }>` — a `MemFilesApi` holding the dropped files under `/drop/…` (folders via `webkitGetAsEntry`, recursive; fallback to `data.files`), and the top-level paths. The commander mounts it as source for the planner/runner by building a `CompositeFilesApi` of the workspace plus `/drop` — or plans against a small composite `{ "/": workspace, "/.drop": dropped }`; pick one and keep it inside `file-commander.tsx`.
  - `TransferDialog({ op, sources, targets: { label: string; path: string }[], files, external?: boolean, onConfirm(req: TransferRequest), onCancel })` — radio Copy / Move (no Move when `external`), target select (when more than one), for one source a name field with "`name` already exists — it will be replaced." under it, for several sources with clashes (from `findClashes`) the three choices Overwrite / Keep both / Skip (default Keep both). Plan `invalid` → the message and a disabled confirm button. Confirm label: "Copy" / "Move".
  - `NewFolderDialog`, `RenameDialog` (both validate with `validateName` and refuse an existing name: "`name` already exists here."), `DeleteDialog` ("Delete 3 items? Local folders and S3 have no trash: this can't be undone.").
  - `ProgressStrip({ progress?: TransferProgress; result?: TransferResult; onCancel; onClose })` — while running: "Copying `file`", a bar, "34 MB of 120 MB · 3 of 7 items", Cancel. After: "Done" / "Cancelled" / "2 of 7 failed", the failures with their reasons, Close.
  - `FileCommander(props: { storages?: ReturnType<typeof newDemoStorages>; panels?: string[]; initial?: { dialog?: "copy" | "move" | "delete" | "rename" | "mkdir"; selected?: string[] }; phone?: boolean })` — default panels `["/documents/clients", "/archive/2025"]`.

Behaviour:
- Panels side by side in a `ResizablePanelGroup` (`@statewalker/ui.view.shadcn`); a header per panel with its title (the folder name), a close button (not on the last panel); a toolbar "New panel" (opens a copy of the active panel's folder). Clicking a panel makes it active (ring). Tab moves the active panel.
- F5/F6 (and Copy to…/Move to…): targets = the other panels' folders; with one other panel it is preselected; the dialog lists them all otherwise, the last active other panel first.
- Drop between panels → the dialog with Move preselected (Copy when the modifier was held). Drop from the desktop → `readDropped`, then the dialog (`external`).
- Confirm → `planTransfer` → `runTransfer` with an `AbortController`; the strip shows progress; at the end both panels refresh (`refreshKey`) and the target panel selects the written items.
- Open a file → a "viewer" tab area on the right of the panels (a simple preview: Markdown/text shown as text, images and PDF as "Preview of <name> (<size>)"), closable; in phone mode it replaces the panel.
- `onProblemAction` → a small inline notice "Opens Settings → Storage" (the real link comes in phase 3).
- Phone (`phone` prop, or width < 640 px via a `matchMedia` check): one panel at a time, a tab row to switch panels, no drag and drop (do not set `draggable`), commands through the context menu (long press = context menu is not needed; a "⋯" button per row opens it).

- [ ] **Step 1: failing tests** (`test/file-commander.test.tsx`)

```tsx
import { readText } from "@statewalker/webrun-files";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { newDemoStorages } from "../src/file-panels/demo-storages.js";
import { FileCommander } from "../src/file-panels/file-commander.js";

afterEach(cleanup);

const panel = (title: string) => screen.getByRole("region", { name: title });

describe("FileCommander", () => {
  it("F5 copies the selection to the other panel after the dialog", async () => {
    const storages = newDemoStorages();
    render(<FileCommander storages={storages} panels={["/documents/notes", "/archive/2026"]} />);
    const left = panel("notes");
    fireEvent.click(await within(left).findByRole("row", { name: "todo.md" }));
    fireEvent.keyDown(within(left).getByRole("grid"), { key: "F5" });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Copy" })).toHaveProperty("checked", true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Done")).toBeTruthy();
    expect(await readText(storages.files, "/archive/2026/todo.md")).toContain("# Todo");
    expect(await within(panel("2026")).findByRole("row", { name: "todo.md" })).toBeTruthy();
  });

  it("a drop between panels preselects Move and moves", async () => {
    const storages = newDemoStorages();
    render(<FileCommander storages={storages} panels={["/documents/notes", "/browser/drafts"]} />);
    const target = await within(panel("drafts")).findByRole("grid");
    const data = { types: ["application/x-sandclaw-paths"], getData: () => JSON.stringify(["/documents/notes/todo.md"]) };
    fireEvent.drop(target, { dataTransfer: data });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Move" })).toHaveProperty("checked", true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    await screen.findByText("Done");
    expect(await storages.files.exists("/documents/notes/todo.md")).toBe(false);
    expect(await storages.files.exists("/browser/drafts/todo.md")).toBe(true);
  });

  it("several clashing items offer one choice; Skip leaves the target alone", async () => {
    const storages = newDemoStorages();
    await storages.files.write("/archive/2026/todo.md", [new TextEncoder().encode("old")]);
    render(<FileCommander storages={storages} panels={["/documents/notes", "/archive/2026"]} />);
    const left = panel("notes");
    fireEvent.click(await within(left).findByRole("row", { name: "meeting-2026-10-02.md" }));
    fireEvent.click(within(left).getByRole("row", { name: "todo.md" }), { ctrlKey: true });
    fireEvent.keyDown(within(left).getByRole("grid"), { key: "F5" });
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("radio", { name: "Skip" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    await screen.findByText("Done");
    expect(await readText(storages.files, "/archive/2026/todo.md")).toBe("old");
    expect(await storages.files.exists("/archive/2026/meeting-2026-10-02.md")).toBe(true);
  });

  it("F8 deletes after the confirmation that says there is no trash", async () => {
    const storages = newDemoStorages();
    render(<FileCommander storages={storages} panels={["/documents/notes", "/archive"]} />);
    const left = panel("notes");
    fireEvent.click(await within(left).findByRole("row", { name: "todo.md" }));
    fireEvent.keyDown(within(left).getByRole("grid"), { key: "F8" });
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("no trash");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await act(async () => {});
    expect(await storages.files.exists("/documents/notes/todo.md")).toBe(false);
  });

  it("copying into a locked mount fails with its reason in the summary", async () => {
    const locked = { cause: "locked" as const, message: "Locked: unlock to use the S3 storages." };
    const storages = newDemoStorages({ unavailable: { archive: locked } });
    render(<FileCommander storages={storages} panels={["/documents/notes", "/documents/clients"]} />);
    const left = panel("notes");
    fireEvent.click(await within(left).findByRole("row", { name: "todo.md" }));
    fireEvent.contextMenu(within(left).getByRole("row", { name: "todo.md" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy to…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Folder"), { target: { value: "/archive" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    expect(await screen.findByText(/Locked: unlock to use the S3 storages\./)).toBeTruthy();
  });
});
```

The *Copy to…* dialog therefore needs an editable "Folder" field (`<Input aria-label="Folder">`) prefilled from the chosen target panel; the target `select` (when several panels) fills it. Each panel is a `<section aria-label={title}>` (`role="region"` by its label).

- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: implement** the dialogs, strip, `readDropped`, the commander.
- [ ] **Step 4: stories** `file-commander.stories.tsx`, title `"Prototypes/Files app/Commander"`, full-height decorator (Global Constraints). Stories:
  - `TwoPanels` — default.
  - `ThreePanels` — `panels: ["/documents/clients", "/archive/2025", "/photos/site-visit"]`.
  - `CopyDialogOne` — `initial: { dialog: "copy", selected: ["/documents/clients/dupont/offer.pdf"] }`.
  - `CopyDialogClashes` — in the story's storages initialiser write `/archive/2025/clients/dupont/offer.pdf` and `/archive/2025/clients/dupont/plan.png`; `panels: ["/documents/clients/dupont", "/archive/2025/clients/dupont"]`; `initial: { dialog: "copy", selected: ["/documents/clients/dupont/offer.pdf", "/documents/clients/dupont/plan.png"] }`.
  - `SlowUpload` — `storages: newDemoStorages({ slowMs: 300 })`, play: none (the reader drags or presses F5 on `backup.zip`).
  - `FailedItem` — `failPaths: ["/archive/2025/notes.md"]`.
  - `LockedArchive` — `unavailable.archive` locked.
  - `S3Unreachable` — `unavailable.photos` = `{ cause: "unreachable", message: "No answer from https://s3.example.com." }`.
  - `DeleteConfirm` — `initial.dialog: "delete"`.
  - `Phone` — `phone: true`.
  Use a fresh `newDemoStorages()` per story render (`render: (args) => <FileCommander {...args} storages={newDemoStorages(...)} />` inside a `useState` initialiser) so stories don't share edits.
- [ ] **Step 5: `file-commander.mdx`** in the style of `src/connectors/connectors.mdx`: what it shows; how panels, breadcrumb menus, transfers and clashes work; variants — **A** dock panels side by side (built) vs **B** a fixed two-pane commander with a shared command bar (F-keys row at the bottom, like Midnight Commander) — describe B in words and recommend; the decisions assumed (from the spec); **open questions** numbered Q1… including the spec's question 1 (default for a cross-storage plain drop), a trash, and anything found while building.
- [ ] **Step 6: register** the stories in `test/stories.test.tsx` (import in sorted position, `...Object.entries(composeStories(fileCommander))` at the end of the list).
- [ ] **Step 7: run everything** — `pnpm test`, typecheck, lint — PASS.
- [ ] **Step 8: commit** `feat(ui-protos.app): Files app prototype — multi-panel commander with copy/move dialogs, progress and desktop drop`

---

### Task 7: Mount settings: types, keys, S3 presets and validation

**Files:**
- Create: `src/file-mounts/mount-config.ts`
- Test: `test/file-mounts-logic.test.ts`

**Interfaces:**
- Consumes: `Problem` (from `../file-panels/problem.js`).
- Produces:

```ts
export type MountTypeId = "local-folder" | "opfs" | "s3" | "memory";
export interface MountConfig { key: string; name: string; type: MountTypeId; config: Record<string, string>; readOnly?: boolean; mounted?: boolean }
export type MountStatus =
  | { state: "mounted" } | { state: "needs-access" } | { state: "locked" }
  | { state: "failed"; problem: Problem } | { state: "unmounted" };

export interface S3Form {
  name: string; key: string; preset: S3PresetId; endpoint: string; region: string; bucket: string;
  prefix: string; accessKeyId: string; secretAccessKey: string; pathStyle: boolean; readOnly: boolean;
}
export type S3PresetId = "aws" | "r2" | "minio" | "b2" | "wasabi" | "other";
export interface S3Preset { id: S3PresetId; label: string; endpoint: string; region: string; pathStyle: boolean; regionRequired: boolean }
export const S3_PRESETS: S3Preset[];
export function applyPreset(form: S3Form, preset: S3PresetId): S3Form;
export function keyFromName(name: string, taken: string[]): string;
export function validateKey(key: string, taken: string[]): string | undefined;
export function normalizeEndpoint(url: string): string;
export function normalizePrefix(prefix: string): string;
export function validateS3Form(form: S3Form, takenKeys: string[]): Partial<Record<keyof S3Form, string>>;
```

Values:
- Presets: AWS `https://s3.<region>.amazonaws.com`, region `""`, pathStyle false, regionRequired true; R2 `https://<account-id>.r2.cloudflarestorage.com`, region `auto`, false; MinIO/RustFS `http://localhost:9000`, `us-east-1`, true; B2 `https://s3.<region>.backblazeb2.com`, `""`, false, regionRequired true; Wasabi `https://s3.<region>.wasabisys.com`, `""`, false, true; Other `""`, `""`, true, false. `applyPreset` fills endpoint (substituting `<region>` when the region is known), region and pathStyle.
- `keyFromName("Archive (S3)", [])` → `"archive-s3"`; with `"archive-s3"` taken → `"archive-s3-2"`.
- `validateKey`: empty → "Enter a key."; starts with `.` → "A key can't start with a dot."; contains any of `/ \ # ? %` or a space → "Use letters, digits, - and _ only."; taken → "Another storage already uses this key."
- `normalizeEndpoint` trims and removes trailing `/`. `normalizePrefix("/a//b")` → `"a/b/"`, `""` → `""`.
- `validateS3Form` messages: name empty → "Enter a name."; endpoint not `https://`, or `http://` other than `localhost`/`127.0.0.1` → "Use an https:// address (http:// only for localhost)."; endpoint still containing `<` → "Replace the part in <…> with your value."; region empty when the preset requires it → "This provider needs a region."; bucket not matching `^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$` → "Bucket names are 3–63 lowercase letters, digits, dots and dashes."; access key / secret empty → "Enter the access key ID." / "Enter the secret access key."; key → `validateKey`.

- [ ] **Step 1: failing tests** — one `it` per rule above with the literal expected values, e.g.:

```ts
import { describe, expect, it } from "vitest";
import { applyPreset, keyFromName, normalizePrefix, validateKey, validateS3Form, type S3Form } from "../src/file-mounts/mount-config.js";

const empty: S3Form = { name: "", key: "", preset: "other", endpoint: "", region: "", bucket: "", prefix: "", accessKeyId: "", secretAccessKey: "", pathStyle: true, readOnly: false };

describe("mount settings", () => {
  it("derives a free key from the name", () => {
    expect(keyFromName("Archive (S3)", [])).toBe("archive-s3");
    expect(keyFromName("Archive (S3)", ["archive-s3"])).toBe("archive-s3-2");
  });
  it("validates keys", () => {
    expect(validateKey(".x", [])).toBe("A key can't start with a dot.");
    expect(validateKey("a b", [])).toBe("Use letters, digits, - and _ only.");
    expect(validateKey("docs", ["docs"])).toBe("Another storage already uses this key.");
  });
  it("normalises a prefix", () => expect(normalizePrefix("/a//b")).toBe("a/b/"));
  it("a preset fills the endpoint, region and addressing", () => {
    const aws = applyPreset({ ...empty, region: "eu-west-3" }, "aws");
    expect(aws).toMatchObject({ endpoint: "https://s3.eu-west-3.amazonaws.com", pathStyle: false });
    expect(applyPreset(empty, "minio")).toMatchObject({ endpoint: "http://localhost:9000", region: "us-east-1", pathStyle: true });
  });
  it("names every invalid field in plain words", () => {
    const errors = validateS3Form({ ...applyPreset(empty, "aws"), name: "A", key: "a", bucket: "My_Bucket", endpoint: "http://s3.example.com" }, []);
    expect(errors).toEqual({
      endpoint: "Use an https:// address (http:// only for localhost).",
      region: "This provider needs a region.",
      bucket: "Bucket names are 3–63 lowercase letters, digits, dots and dashes.",
      accessKeyId: "Enter the access key ID.",
      secretAccessKey: "Enter the secret access key.",
    });
  });
});
```

- [ ] **Step 2: run — FAIL.** **Step 3: implement.** **Step 4: run — PASS**, typecheck, lint.
- [ ] **Step 5: commit** `feat(ui-protos.app): Files app prototype — mount settings, S3 presets and validation`

---

### Task 8: S3 problems and the connection test

**Files:**
- Create: `src/file-mounts/s3-problems.ts`, `src/file-mounts/connection-test.ts`
- Test: `test/file-mounts-logic.test.ts` (append)

**Interfaces:**
- Consumes: `Problem` (Task 1), `S3Form` (Task 7).
- Produces:

```ts
// s3-problems.ts
export interface S3ErrorLike { name?: string; message?: string; $metadata?: { httpStatusCode?: number } }
export type CheckId = "endpoint" | "keys" | "bucket" | "list" | "write";
export function classifyS3Error(error: unknown, ctx: { check: CheckId; endpoint: string; bucket: string; origin: string; hostAnswers?: boolean }): Problem;
export function corsRule(origin: string): string;   // pretty JSON, 2-space indent

// connection-test.ts
export interface S3Probe {             // phase 2: implemented with S3Client; here: fakeProbe
  hostAnswers(): Promise<boolean>;     // unsigned no-cors fetch: true when the host answers at all
  check(id: CheckId): Promise<void>;   // throws an S3-like error
}
export interface ConnectionReport { ok: boolean; checks: { id: CheckId; label: string; state: "ok" | "failed" | "skipped" | "not-run" }[]; problem?: Problem }
export function runConnectionTest(probe: S3Probe, form: Pick<S3Form, "endpoint" | "bucket" | "readOnly">, opts: { origin: string; signal?: AbortSignal; timeoutMs?: number }): Promise<ConnectionReport>;
export type ProbeScenario = "ok" | "bad-keys" | "clock-skew" | "no-bucket" | "denied-list" | "denied-write" | "cors" | "unreachable" | "timeout";
export function fakeProbe(scenario: ProbeScenario, delayMs?: number): S3Probe;
```

Rules:
- Check labels: endpoint "The address answers", keys "The keys are accepted", bucket "The bucket exists", list "Listing is allowed", write "Writing is allowed".
- Checks run in order; the first failure is `failed`, later ones `not-run`; `write` is `skipped` when `readOnly`.
- `classifyS3Error` mapping and messages (verbatim from the spec's table):
  - `InvalidAccessKeyId`, `SignatureDoesNotMatch` → `bad-keys`, "Wrong access key or secret."
  - `RequestTimeTooSkewed` → `clock-skew`, "This computer's clock is off by more than 15 minutes; S3 refuses the request."
  - `NoSuchBucket` → `no-bucket`, "Bucket `<bucket>` not found at this endpoint."
  - `AccessDenied` or HTTP 403 → `denied`, "These keys can't list this bucket." (check `list`/`bucket`/`keys`) or "These keys can't write to this bucket." (check `write`)
  - `TimeoutError` / `AbortError` → `timeout`, "No answer in 15 seconds."
  - `TypeError` with "Failed to fetch" (or `NetworkError`): `hostAnswers` true → `cors`, "The bucket doesn't allow this site. Add this CORS rule to the bucket:", `fix: { kind: "cors-rule", json: corsRule(origin) }`; else → `unreachable`, "No answer from `<endpoint>`."
  - anything else → `unknown`, "The storage refused the request.", `detail` = the raw message.
  - every problem keeps `detail` = `"<name>: <message>"` of the raw error.
- `runConnectionTest` aborts after `timeoutMs` (default 15000) → the running check fails with `timeout`; on a network-type error it calls `probe.hostAnswers()` before classifying.
- `corsRule(origin)` returns:

```json
[
  {
    "AllowedOrigins": ["<origin>"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["authorization", "content-type", "content-md5", "x-amz-content-sha256", "x-amz-date", "x-amz-security-token", "x-amz-user-agent", "x-amz-copy-source", "x-amz-metadata-directive", "amz-sdk-invocation-id", "amz-sdk-request"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

- `fakeProbe(scenario)`: `ok` passes all; `bad-keys` fails `keys` with `{ name: "InvalidAccessKeyId" }`; `clock-skew` fails `keys` with `RequestTimeTooSkewed`; `no-bucket` fails `bucket` with `NoSuchBucket`; `denied-list` fails `list` with `AccessDenied`; `denied-write` fails `write` with `AccessDenied`; `cors` fails `endpoint` with `new TypeError("Failed to fetch")` and `hostAnswers` → true; `unreachable` same error, `hostAnswers` → false; `timeout` never resolves `endpoint` (the test's timeout fires). Each check waits `delayMs` (default 0) so stories show progress.

- [ ] **Step 1: failing tests**

```ts
import { runConnectionTest, fakeProbe } from "../src/file-mounts/connection-test.js";
import { classifyS3Error, corsRule } from "../src/file-mounts/s3-problems.js";

const form = { endpoint: "https://s3.example.com", bucket: "archive", readOnly: false };
const origin = "https://files.sandclaw.app";

describe("connection test", () => {
  it("passes every check", async () => {
    const report = await runConnectionTest(fakeProbe("ok"), form, { origin });
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => c.state)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
  });
  it("stops at the first failure and names it", async () => {
    const report = await runConnectionTest(fakeProbe("no-bucket"), form, { origin });
    expect(report.checks.map((c) => c.state)).toEqual(["ok", "ok", "failed", "not-run", "not-run"]);
    expect(report.problem?.message).toBe("Bucket `archive` not found at this endpoint.");
  });
  it("skips the write check for a read-only mount", async () => {
    const report = await runConnectionTest(fakeProbe("denied-write"), { ...form, readOnly: true }, { origin });
    expect(report.ok).toBe(true);
    expect(report.checks.at(-1)?.state).toBe("skipped");
  });
  it("tells CORS from an unreachable host", async () => {
    const cors = await runConnectionTest(fakeProbe("cors"), form, { origin });
    expect(cors.problem?.cause).toBe("cors");
    expect(cors.problem?.fix?.json).toBe(corsRule(origin));
    const down = await runConnectionTest(fakeProbe("unreachable"), form, { origin });
    expect(down.problem?.message).toBe("No answer from https://s3.example.com.");
  });
  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    const running = runConnectionTest(fakeProbe("timeout"), form, { origin, timeoutMs: 15000 });
    await vi.advanceTimersByTimeAsync(15000);
    const report = await running;
    vi.useRealTimers();
    expect(report.problem?.message).toBe("No answer in 15 seconds.");
  });
});

describe("classifyS3Error", () => {
  const ctx = { check: "write" as const, endpoint: "https://s3.example.com", bucket: "archive", origin };
  it("maps SDK errors to plain causes and keeps the raw detail", () => {
    expect(classifyS3Error({ name: "SignatureDoesNotMatch", message: "x" }, ctx)).toMatchObject({ cause: "bad-keys", message: "Wrong access key or secret.", detail: "SignatureDoesNotMatch: x" });
    expect(classifyS3Error({ name: "Forbidden", $metadata: { httpStatusCode: 403 } }, ctx).message).toBe("These keys can't write to this bucket.");
    expect(classifyS3Error({ name: "Weird", message: "boom" }, ctx)).toMatchObject({ cause: "unknown", detail: "Weird: boom" });
  });
});
```

The `no-bucket` and `unreachable` messages in the tests use the bucket name and endpoint without backticks only if the implementation does so; the spec's table shows `name` in code style — **render the message strings exactly as** "Bucket `archive` not found at this endpoint." and "No answer from https://s3.example.com." (backticks in the first, none in the second), matching the tests.

- [ ] **Step 2: run — FAIL.** **Step 3: implement.** **Step 4: run — PASS**, typecheck, lint.
- [ ] **Step 5: commit** `feat(ui-protos.app): Files app prototype — S3 connection test and plain-language problems`

---

### Task 9: Storage settings UI, S3 form, vault

**Files:**
- Create: `src/file-mounts/mock-vault.ts`, `src/file-mounts/vault-dialogs.tsx`, `src/file-mounts/mount-form.tsx`, `src/file-mounts/storage-settings.tsx`, `src/file-mounts/storage-settings.stories.tsx`, `src/file-mounts/storage-settings.mdx`
- Modify: `test/stories.test.tsx` (register)
- Test: `test/storage-settings.test.tsx`

**Interfaces:**
- Consumes: Tasks 7–8; `Problem`.
- Produces:
  - `class MockVault` — `state: "absent" | "locked" | "unlocked"`, `create(password, remember)`, `unlock(password, remember): boolean` (the right password is the one created; in stories, `new MockVault({ state: "locked", password: "correct horse" })`), `lock()`, `changePassword(old, next): boolean`, `forget()`, `reset()`, `onUpdate(listener)`. Password rule for create/change: at least 8 characters → else "Use at least 8 characters."; confirmation must match → "The two passwords differ."
  - `VaultDialog({ vault, mode: "create" | "unlock" | "change", onDone, onCancel })` — create: password + confirm + "Remember on this browser" (a native checkbox; no Checkbox in the shadcn package); unlock: password + remember, wrong password → "Wrong password."; change: old + new + confirm.
  - `MountForm({ initial?: MountConfig & { form?: S3Form }, takenKeys, probe: (form: S3Form) => S3Probe, origin, vault, onSave(config, form), onCancel })` — step 1 type chooser (Local folder — disabled with "This browser can't open local folders; use Chrome or Edge." when `typeof window.showDirectoryPicker !== "function"`; Browser storage; S3); local folder → "Choose folder…" (in the prototype it fills a fake name "Projects"); browser storage → name only; S3 → the fields (preset `Select`, endpoint, region, bucket, prefix, key ID, secret with show/hide, path-style and read-only checkboxes, name and key with key derived from name until edited). Field errors from `validateS3Form` appear under fields after the first Save or Test. *Test connection* runs `runConnectionTest` and shows the five checks (tick / cross / dash / spinner), the problem message, a "Details" `Collapsible` with `detail`, and for `cors` the rule in a `<pre>` with a *Copy rule* button. *Save* runs the test first; a failed test shows *Save anyway*. Saving S3 with the vault `absent` opens `VaultDialog` create; `locked` → unlock; then `onSave`.
  - `StorageSettings({ mounts: { config: MountConfig; status: MountStatus; where: string }[], vault, probe, origin, phone? })` — the list (name, type icon, `where`, status label and action: Mounted · Needs access → Reconnect · Locked → Unlock · Failed → the problem message, Details, Retry · Unmounted → Mount), per-row actions Edit / Unmount / Remove (Remove asks: "Remove `name`? Its saved keys are deleted. The files themselves stay where they are."), *Add storage* → `MountForm`, and a *Secret keys* section (vault state; Unlock / Lock / Change password / Forget this browser / Reset, Reset asks "Delete all saved keys? Storages stay, waiting for their keys again."). State lives in the component (mock); Unlock makes `locked` rows `mounted`.

- [ ] **Step 1: failing tests** (`test/storage-settings.test.tsx`)

```tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { fakeProbe } from "../src/file-mounts/connection-test.js";
import { MockVault } from "../src/file-mounts/mock-vault.js";
import { StorageSettings } from "../src/file-mounts/storage-settings.js";
import { DEMO_MOUNTS } from "../src/file-mounts/storage-settings.stories.js";

afterEach(cleanup);
const origin = "https://files.sandclaw.app";

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("StorageSettings", () => {
  it("adds an S3 storage after a passing test, creating the vault first", async () => {
    render(<StorageSettings mounts={DEMO_MOUNTS} vault={new MockVault({ state: "absent" })} probe={() => fakeProbe("ok")} origin={origin} />);
    fireEvent.click(screen.getByRole("button", { name: "Add storage" }));
    fireEvent.click(screen.getByRole("button", { name: /S3/ }));
    fill("Name", "Backups");
    fill("Endpoint", "https://s3.example.com");
    fill("Bucket", "backups");
    fill("Access key ID", "AKIA123");
    fill("Secret access key", "secret");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog", { name: "Protect your keys with a password" });
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "correct horse" } });
    fireEvent.change(within(dialog).getByLabelText("Repeat the password"), { target: { value: "correct horse" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("row", { name: /Backups/ })).toBeTruthy();
  });

  it("a failed test shows the cause, the CORS rule, and Save anyway", async () => {
    render(<StorageSettings mounts={DEMO_MOUNTS} vault={new MockVault({ state: "unlocked", password: "correct horse" })} probe={() => fakeProbe("cors")} origin={origin} />);
    fireEvent.click(screen.getByRole("button", { name: "Add storage" }));
    fireEvent.click(screen.getByRole("button", { name: /S3/ }));
    fill("Name", "Backups"); fill("Endpoint", "https://s3.example.com"); fill("Bucket", "backups");
    fill("Access key ID", "AKIA123"); fill("Secret access key", "secret");
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("The bucket doesn't allow this site. Add this CORS rule to the bucket:")).toBeTruthy();
    expect(screen.getByText(/x-amz-copy-source/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Save anyway" })).toBeTruthy();
  });

  it("shows field errors in plain words", async () => {
    render(<StorageSettings mounts={DEMO_MOUNTS} vault={new MockVault({ state: "unlocked", password: "x".repeat(8) })} probe={() => fakeProbe("ok")} origin={origin} />);
    fireEvent.click(screen.getByRole("button", { name: "Add storage" }));
    fireEvent.click(screen.getByRole("button", { name: /S3/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a name.")).toBeTruthy();
    expect(screen.getByText("Enter the access key ID.")).toBeTruthy();
  });

  it("unlocking the vault mounts the locked S3 storages", async () => {
    render(<StorageSettings mounts={DEMO_MOUNTS} vault={new MockVault({ state: "locked", password: "correct horse" })} probe={() => fakeProbe("ok")} origin={origin} />);
    const row = screen.getByRole("row", { name: /Archive \(S3\)/ });
    fireEvent.click(within(row).getByRole("button", { name: "Unlock" }));
    const dialog = await screen.findByRole("dialog", { name: "Unlock your keys" });
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlock" }));
    expect(await within(dialog).findByText("Wrong password.")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "correct horse" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlock" }));
    expect(await within(screen.getByRole("row", { name: /Archive \(S3\)/ })).findByText("Mounted")).toBeTruthy();
  });
});
```

`DEMO_MOUNTS` is exported by the stories module (Documents local folder mounted; Browser storage mounted; Archive (S3) locked; Photos (S3) failed with the CORS problem; Old NAS (S3) unmounted). Each row is `role="row"` with `aria-label` = the storage name.

- [ ] **Step 2: run — FAIL.** **Step 3: implement.**
- [ ] **Step 4: stories** `storage-settings.stories.tsx`, title `"Prototypes/Files app/Storage settings"`, centred decorator, card max width ~720 px. Stories: `List` (vault unlocked), `ListLocked`, `AddChooseType`, `AddS3` (form open), `TestPassing` (probe `ok`, delay 400), and one story per failing scenario: `TestBadKeys`, `TestNoBucket`, `TestDeniedWrite`, `TestCors`, `TestUnreachable`, `TestClockSkew`; `CreateVault`, `UnlockVault`, `ChangePassword`, `NoLocalFolders` (window without `showDirectoryPicker`: pass a prop `localFoldersAvailable={false}` instead of patching window), `Phone` (390). Add `localFoldersAvailable?: boolean` to `MountForm`/`StorageSettings` props (default: detected).
- [ ] **Step 5: `storage-settings.mdx`** — what it shows, the checks and their messages, CORS, the vault; variants **A** list + separate form page (built) vs **B** list with the form in a side sheet — recommend; open questions Q1… (including the spec's questions 2 and 3: the app origin for CORS; per-browser vs per-person settings).
- [ ] **Step 6: register** in `test/stories.test.tsx`; **Step 7:** all checks PASS.
- [ ] **Step 8: commit** `feat(ui-protos.app): Files app prototype — storage settings with S3 connection test and key vault`

---

### Task 10: Width sweep, notes

**Files:**
- Notes (repo `~/workspace-statewalker/notes`): `2026/2026-10/2026-10-10/sandclaw-ui-open-questions.md`, `2026/2026-10/2026-10-10/sandclaw-ui-prototypes-map.md`, `2026/2026-10/index.md`

- [ ] **Step 1: sweep.** With Storybook on :6006 (already running; `touch src/index.css` if new folders render unstyled), put the ids of stories whose `importPath` contains `src/file-panels/` or `src/file-mounts/` (from `http://localhost:6006/index.json`) into the ids file read by `scratchpad/b5.py`, run it at 390 and 1280; expected: no `OVERFLOW` lines, `errors: []`. Look at the screenshots of TwoPanels, CopyDialogClashes, Phone, TestCors.
- [ ] **Step 2: notes.** Add a group "### Files app" before "### Brand" in the open-questions note, renumbering the two mdx files' questions to T164…; add a row **G1 Files app** (new area "G. Files app", the first application) to the prototypes map with ✅ and the commit ids, a checkbox line in Next; update the month index line. Commit and push the notes (only these three files).
- [ ] **Step 3: push** the sandclaw branch.

---

## Phases 2–4

Each gets its own plan after phase 1's prototypes are reviewed: phase 2 moves `paths.ts`, `transfer-plan.ts`, `transfer-run.ts`, `mount-config.ts`, `s3-problems.ts`, `connection-test.ts` into `packages/file-panels.core` and `packages/file-mounts.core` (adding the real mount table, mount types, `S3Probe` over `S3Client`, the vault port and a RustFS integration suite); phase 3 builds the view packages, the `app-shell` option and `apps/files.app`; phase 4 search.
