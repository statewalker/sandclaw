# Unified App — Stage 2: One World and Links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every view of the App shows the same Atelier Morel folder, and the main links across views work: a todo, an assistant output, a cited source, a site page open their file; an indexing item or an Explore result shows its folder; a notification, the group pill and Team's Manage go where they point.

**Architecture:** The App's file panels move onto a demo storage whose `/documents` mount holds the `mock.ts` folder, so the paths every prototype already uses (`Clients/Dupont — offer.docx`) are real files there. Two commands, `files:open` and `files:reveal`, take those folder-relative paths; the Files feature maps them onto the commander, which gains `openFile` and `reveal`. Each prototype component gets one optional callback (or, for citations rendered deep inside, a context); each feature turns it into a command.

**Tech Stack:** as Stage 1 — React 19, dockview-react, `@statewalker/shared-slots` / `shared-commands`, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-12-unified-app-design.md`, section "Stage 2 — Shared world and links". Stage 1 plan (for the shell's code and decisions): `docs/superpowers/plans/2026-10-12-unified-app-stage-1-shell.md`.

## Global Constraints

- Worktree `~/sw-migration/work/sandclaw.worktrees/feat-unified-app-2`, branch `feat/unified-app-stage-2`. Node: `export PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH`. If `pnpm typecheck` fails on missing `dist` of `packages/file-mounts.core` or `packages/file-panels.core`, run `pnpm build` in those two packages first (dist is git-ignored).
- Kebab-case file names. Never name a React prop `role`. No `x!`. Tests at public seams against real implementations.
- Every task ends green on, from `apps/ui-protos.app`: `set -o pipefail; pnpm test` (check the exit status), `pnpm typecheck`; and from the repo root `pnpm biome check --write --unsafe apps/ui-protos.app`.
- Command keys, verbatim: `files:open` (payload `{ path, citation? }`), `files:reveal` (payload `{ path }`). `path` is relative to the user's folder, exactly as the views name files (`Notes/todo.md`, `Clients/Dupont — offer.docx`); the folder is the `/documents` mount.
- Prototype components keep working without the App: every new prop or context is optional, and without it the component behaves exactly as today (its stories and tests unchanged).
- Commit trailers: `Co-Authored-By: <the model that wrote the commit> <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz`. Never push, merge or deploy.

## Decisions beyond the spec

1. **The commander's own stories and tests keep their seed.** The spec says `newDemoStorages()` itself moves to the Atelier Morel tree; about 150 assertions across six test files and two story files name its paths. Instead `newDemoStorages` takes an optional `seed`, and the App builds its storage from `mock.ts`'s `folder`. Every view *in the App* shows one world, which is what the spec's purpose asks for.
2. **The shell owns the App's storage** (with the commander, Stage 1 Decision 15), so `AppShell` creates it; its tests and the App's see the same world.
3. **A notice's target is data on the notice** (`target?: NoticeTarget`), not inferred from its text.
4. **Opening a site's table of contents** is a center view (`site-toc`, the existing TocEditor) shown with `dock:show-panel`; no `sites:edit-toc` command is needed.
5. **Team's Manage** is a button the Mesh feature puts above the Team view for an admin; `team.tsx` is unchanged.
6. **Citations inside answers** reach the App through a context (`OpenSourceContext`), because `Citation`/`SourceCard` are rendered several levels below any component the App renders.

## Review Focus

1. **A path the folder does not have** (a site page citing a photo that is not in the folder, an assistant output never written): opening it must say so, not crash or open an empty tab. → Task 2 test "a file that is not in the folder says so".
2. **Opening a file already open** must bring its tab forward, not add a second. → Task 2 test "opening an open file brings its tab forward".
3. **Opening a file on a phone while another view is shown** must switch to Files and show it full screen. → Task 2 test "on a phone, opening a file switches to Files and shows it full screen".
4. **A member clicking a notification that targets an admin Settings section** must land on the first section they can see, not a blank page. → Task 4 test "a notice that targets an admin section opens the first one for a member".
5. **Revealing a file when the active panel is the Files tree** must use a docked file panel, so the user sees the folder in the center. → Task 2 test "reveal shows the folder in a docked panel with the file selected".

---

### Task 1: One world for the App

**Files:**
- Modify: `apps/ui-protos.app/src/file-panels/demo-storages.ts` (`newDemoStorages` gains `seed`)
- Create: `apps/ui-protos.app/src/app/world.ts`
- Modify: `apps/ui-protos.app/src/app/shell/app-shell.tsx` (storage and START_PANELS)
- Modify: `apps/ui-protos.app/src/file-mounts/demo-storage-settings.tsx`, `src/file-mounts/storage-settings.stories.tsx` (no "acme")
- Modify: `apps/ui-protos.app/test/app-shell.test.tsx`, `test/app.test.tsx` (new names)
- Test: `apps/ui-protos.app/test/app-world.test.ts`

**Interfaces:**
- Produces: `newDemoStorages(opts)` with `opts.seed?: Partial<Record<"documents" | "browser" | "archive" | "photos", Record<string, string | Uint8Array>>>`; from `src/app/world.ts`: `FOLDER_MOUNT = "/documents"`, `worldPath(path: string): string`, `folderSeed(entries: FolderEntry[]): Record<string, string | Uint8Array>`, `newAppStorages()`.

- [ ] **Step 1: Write the failing test** — `test/app-world.test.ts`:

```ts
import { readText } from "@statewalker/webrun-files";
import { describe, expect, it } from "vitest";
import { newAppStorages, worldPath } from "../src/app/world.js";
import { folder } from "../src/mock.js";

describe("the App's world", () => {
  it("the folder's files are real files under /documents, with their text", async () => {
    const { files } = newAppStorages();
    expect(worldPath("Notes/todo.md")).toBe("/documents/Notes/todo.md");
    const todo = folder
      .find((e) => e.name === "Notes")
      ?.children?.find((e) => e.name === "todo.md")?.text;
    expect(await readText(files, worldPath("Notes/todo.md"))).toBe(todo);
    expect(await files.stats(worldPath("Clients/Dupont — offer.docx"))).toMatchObject({
      kind: "file",
    });
    expect(await files.stats(worldPath("Outputs/clients.pptx"))).toMatchObject({ kind: "file" });
  });
});
```

- [ ] **Step 2: Run it** — `pnpm vitest --run test/app-world.test.ts` → FAIL (cannot resolve `../src/app/world.js`).

- [ ] **Step 3: `seed` in `newDemoStorages`** — add `seed?: Partial<Record<string, Record<string, string | Uint8Array>>>` to its `opts` (document it: "Replaces a mount's files; the App uses it for its own world") and change `new MemFilesApi({ initialFiles: SEED[m.key] })` to `new MemFilesApi({ initialFiles: opts.seed?.[m.key] ?? SEED[m.key] })`.

- [ ] **Step 4: `src/app/world.ts`**

```ts
// The App's one world: the user's folder from mock.ts, as real files in the
// demo storage's Documents mount, so every view's paths open in the commander.
import { newDemoStorages } from "../file-panels/demo-storages.js";
import { type FolderEntry, folder } from "../mock.js";

/** Where the user's folder is mounted. */
export const FOLDER_MOUNT = "/documents";

/** A path as the views name it ("Notes/todo.md") → its path in the storage. */
export const worldPath = (path: string) => `${FOLDER_MOUNT}/${path}`;

/** Stand-in content for files whose text the prototypes don't need. */
const placeholder = (n: number) => new Uint8Array(n).fill(65);

/** The folder's files by path; folders become paths, files without text get stand-in bytes. */
export function folderSeed(entries: FolderEntry[], prefix = ""): Record<string, string | Uint8Array> {
  const seed: Record<string, string | Uint8Array> = {};
  for (const entry of entries) {
    const path = `${prefix}/${entry.name}`;
    if (entry.children) Object.assign(seed, folderSeed(entry.children, path));
    else seed[path] = entry.text ?? placeholder(24_000);
  }
  return seed;
}

/** The demo storages with the user's folder in Documents, plus the deck the assistant writes. */
export function newAppStorages() {
  return newDemoStorages({
    seed: { documents: { ...folderSeed(folder), "/Outputs/clients.pptx": placeholder(180_000) } },
  });
}
```

(If `FolderEntry` is not exported from `mock.ts`, export it there.)

- [ ] **Step 5: The shell uses it** — in `app-shell.tsx`: import `newAppStorages`, `FOLDER_MOUNT`; replace `START_PANELS` with

```ts
const START_PANELS = [
  { path: FOLDER_MOUNT, view: "tree" as const, dock: false as const },
  `${FOLDER_MOUNT}/Clients`,
  `${FOLDER_MOUNT}/Finance`,
];
```

and create the storage once per shell: `const [storages] = useState(newAppStorages);` then `useCommander({ storages, panels: START_PANELS })`.

- [ ] **Step 6: No "acme"** — in `demo-storage-settings.tsx` rename the buckets `acme-archive` → `atelier-morel-archive`, `acme-photos` → `atelier-morel-photos` (and the `where` texts with them); in `storage-settings.stories.tsx` `acme-backups` → `atelier-morel-backups`, `acme-site-photos` → `atelier-morel-site-photos`.

- [ ] **Step 7: Update the App tests to the world's names** — the App's panels are now "Clients" and "Finance":
  - `test/app-shell.test.tsx`: tabs `"clients"` → `"Clients"`, `"2025"` → `"Finance"`; the phone file test: tab `"Finance"`, row `/2026-Q3\.xlsx/`, region `"Viewer: 2026-Q3.xlsx"`.
  - `test/app.test.tsx`: the Rename test's row `/backup\.zip/` → `/2026-Q3\.xlsx/` and dialog `"Rename backup.zip"` → `"Rename 2026-Q3.xlsx"`; "Contents of /documents" stays.
  - Add to `test/app.test.tsx`:

```tsx
  it("the Files tree shows the Atelier Morel folder", async () => {
    renderApp();
    const tree = screen.getByRole("treegrid", { name: "Contents of /documents" });
    for (const name of ["Clients", "Finance", "Notes", "Outputs"]) {
      expect(await within(tree).findByRole("row", { name: new RegExp(name) })).toBeTruthy();
    }
  });
```

- [ ] **Step 8: Run** — the focused tests, then the full checks. Expected green.

- [ ] **Step 9: Commit** — `feat(ui-protos.app): the App's one world — the Atelier Morel folder in Documents`.

---

### Task 2: `files:open` and `files:reveal`

**Files:**
- Modify: `apps/ui-protos.app/src/app/contracts.ts` (two commands)
- Modify: `apps/ui-protos.app/src/file-panels/use-commander.tsx` (export `openFile`, add `reveal`; `Viewer.citation`; `ViewerBody` shows the real viewer for known documents)
- Modify: `apps/ui-protos.app/src/app/features/files.tsx` (handlers)
- Modify: `apps/ui-protos.app/src/app/shell/app-shell.tsx` (phone switches to Files when a file opens)
- Test: `apps/ui-protos.app/test/app-links.test.tsx` (new)

**Interfaces:**
- Consumes: Task 1 (`worldPath`, the world's files).
- Produces: in `contracts.ts`: `OpenFile` (`files:open`, `{ path: string; citation?: Citation }`), `RevealFile` (`files:reveal`, `{ path: string }`), with `Citation` from `src/viewers/files.ts`. In the commander's return value: `openFile(path: string, from?: string, citation?: Citation): Promise<void>` and `reveal(path: string): void`. `Viewer` gains `citation?: Citation`.

- [ ] **Step 1: Write the failing tests** — `test/app-links.test.tsx`:

```tsx
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/app/app.js";
import { OpenFile, RevealFile } from "../src/app/contracts.js";
import { createRuntime } from "../src/app/runtime.js";

afterEach(cleanup);

function renderApp(props: Parameters<typeof App>[0] = {}) {
  const runtime = createRuntime();
  render(<App runtime={runtime} {...props} />);
  return runtime;
}
const tab = (title: string) =>
  screen.queryAllByText(title).filter((el) => el.closest(".dv-tab")) as HTMLElement[];
const groupOf = (el: HTMLElement | undefined) => el?.closest(".dv-groupview");

describe("files:open and files:reveal", () => {
  it("opens a file as a tab beside the active file panel, its cited passage marked", async () => {
    const rt = renderApp();
    await screen.findByRole("row", { name: /2026-Q3\.xlsx/ });
    act(() => {
      rt.commands.call(OpenFile, {
        path: "Clients/Dupont — offer.docx",
        citation: { question: "What did we offer Dupont?", blockId: "phase-1" },
      });
    });
    expect(await screen.findByText(/Cited in/)).toBeTruthy();
    const [offer] = tab("Dupont — offer.docx");
    expect([groupOf(tab("Clients")[0]), groupOf(tab("Finance")[0])]).toContain(groupOf(offer));
  });

  it("opening an open file brings its tab forward", async () => {
    const rt = renderApp();
    for (let i = 0; i < 2; i++) {
      act(() => {
        rt.commands.call(OpenFile, { path: "Notes/todo.md" });
      });
      await screen.findAllByText("todo.md");
    }
    expect(tab("todo.md")).toHaveLength(1);
  });

  it("a file that is not in the folder says so", async () => {
    const rt = renderApp();
    act(() => {
      rt.commands.call(OpenFile, { path: "Clients/Nobody — nothing.pdf" });
    });
    expect(await screen.findByText(/not found|couldn't|can't/i)).toBeTruthy();
    expect(tab("Nobody — nothing.pdf")).toHaveLength(0);
  });

  it("reveal shows the folder in a docked panel with the file selected", async () => {
    const rt = renderApp();
    // The Files tree (not docked) is the active panel after a click in it.
    const tree = screen.getByRole("treegrid", { name: "Contents of /documents" });
    fireEvent.mouseDown(tree);
    act(() => {
      rt.commands.call(RevealFile, { path: "Notes/meeting 2026-10-02.md" });
    });
    const row = await screen.findByRole("row", { name: /meeting 2026-10-02\.md/ });
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(within(tree).queryByRole("row", { name: /meeting 2026-10-02\.md/ })).toBeNull();
  });

  it("on a phone, opening a file switches to Files and shows it full screen", async () => {
    const rt = renderApp({ initialMode: "mobile" });
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Views" })).getByRole("button", {
        name: "Todos",
      }),
    );
    act(() => {
      rt.commands.call(OpenFile, { path: "Notes/todo.md" });
    });
    expect(await screen.findByRole("region", { name: "Viewer: todo.md" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("region", { name: "Viewer: todo.md" })).toBeNull();
  });
});
```

Check the `blockId` against `src/ask/answers.ts` (`documents["Clients/Dupont — offer.docx"]`) and use a real block id from it; check how a selected row exposes selection in `file-panel.tsx` (`aria-selected` or another attribute) and assert with what the code uses. Keep each test's intent.

- [ ] **Step 2: Run them** — FAIL (no `OpenFile` export).

- [ ] **Step 3: The commands** — in `contracts.ts`:

```ts
import type { Citation } from "../viewers/files.js";

/**
 * Opens a file of the user's folder — `path` as the views name it ("Notes/todo.md") — as a
 * tab beside the active file panel (an open one comes forward); on a phone, full screen.
 */
export const OpenFile = silent<{ path: string; citation?: Citation }>("files:open");
/** Shows a file's folder in the active docked file panel, with the file selected. */
export const RevealFile = silent<{ path: string }>("files:reveal");
```

- [ ] **Step 4: The commander** — in `use-commander.tsx`:
  - `Viewer` gains `/** The passage a citation points at, marked in the viewer. */ citation?: Citation;` (import `Citation` from `../viewers/files.js`).
  - `openFile` becomes `async (path: string, from?: string, citation?: Citation)`; `from` defaults to the active docked panel's id (the first panel with `dock !== false` in recency order, or the first docked panel); it passes `citation` into `setViewer`. Its existing error path (the notice) is how a missing file "says so" — if `files.stats` returns undefined for a missing file instead of throwing, set the notice "“<name>” is not in the folder." and return without a viewer.
  - Add `reveal(path: string)`: the target is the active docked panel (as above); `update(target.id, { path: <parent folder of path>, selected: [path] })`, then `activate(target.id)`.
  - Return `openFile` and `reveal` with the rest.
  - `ViewerBody`: when the viewer's path is under `/documents/` and the rest is a document `src/viewers/files.ts` knows (`viewerFiles`), render `<FileViewer path={rest} citation={viewer.citation} />` from `src/viewers/viewers.tsx`; otherwise as today.
  - The dock's viewer effect (`dock-files.tsx`) already focuses an open viewer tab; check that a second `setViewer` for the same path with a new citation updates the stored viewer (`setViewers((v) => ({ ...v, [id]: viewer }))` does).

- [ ] **Step 5: The Files feature handles them** — in `features/files.tsx`:

```ts
      handle(rt, OpenFile, ({ path, citation }) => {
        void ctx.commander.current?.openFile(worldPath(path), undefined, citation);
      }),
      handle(rt, RevealFile, ({ path }) => ctx.commander.current?.reveal(worldPath(path))),
```

- [ ] **Step 6: The phone follows** — in `app-shell.tsx`, an effect: when `mode === "mobile"` and `commander.viewer` becomes set, `setPhoneView("files")`.

- [ ] **Step 7: Run** — focused, then full checks. Existing commander/dock tests must stay green (the `openFile` signature change is internal to the commander; `panelProps.onOpenFile` keeps passing the panel's id as `from`).

- [ ] **Step 8: Commit** — `feat(ui-protos.app): files:open and files:reveal — open a folder file anywhere, cited passage marked`.

---

### Task 3: File links from the views

**Files:**
- Modify: `src/notes-todos/todos-view.tsx` (`onOpenFile?`), `src/assistant-panel/assistant-panel.tsx` (`onOpenFile?` for outputs), `src/ask/grounded-answer.tsx` (`OpenSourceContext`), `src/indexing/indexing.tsx` (`IndexingTree` `onReveal?`), `src/sites/site-viewer.tsx` + `src/sites/sites.tsx` (`onOpenFile?`)
- Modify: `src/app/features/todos.tsx`, `assistant.tsx`, `indexing.tsx`, `sites.tsx` (wire them)
- Test: `test/app-links.test.tsx` (append)

**Interfaces:**
- Consumes: Task 2 `OpenFile`, `RevealFile`.
- Produces: `TodosView({ grouping?, onOpenFile?(path: string) })`; `AssistantPanel({ …, onOpenFile?(path: string) })`; `OpenSourceContext: React.Context<((source: Source) => void) | null>` exported from `grounded-answer.tsx`; `IndexingTree({ …, onReveal?(path: string) })`; `SiteViewer({ …, onOpenFile?(path: string) })`, `Sites({ …, onOpenFile?(path: string) })`.

- [ ] **Step 1: Write the failing tests** — append to `test/app-links.test.tsx` (inside a new `describe("links from the views")`):

```tsx
  it("a todo's file opens beside the active file panel", async () => {
    renderApp();
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Activity bar" })).getByRole("button", {
        name: "Todos",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open Notes/todo.md" }));
    expect(await screen.findAllByText("todo.md")).not.toHaveLength(0);
    expect(tab("todo.md")).toHaveLength(1);
  });

  it("an assistant's output opens", async () => {
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: /Outputs\/clients\.pptx/ }));
    expect(tab("clients.pptx")).toHaveLength(1);
  });

  it("Open file on a cited source opens it with the passage marked", async () => {
    const rt = renderApp();
    act(() => {
      rt.commands.call(ShowPanel, { id: "how-answered" });
    });
    // Any source card or citation of the answer opens its preview, which has "Open file".
    fireEvent.click((await screen.findAllByRole("button", { name: /Dupont — offer\.docx/ }))[0] as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Open file" }));
    expect(await screen.findByText(/Cited in/)).toBeTruthy();
  });

  it("a file in the indexing tree shows in the active file panel", async () => {
    renderApp();
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Activity bar" })).getByRole("button", {
        name: "Indexing",
      }),
    );
    // Open Clients, then click a file in it.
    fireEvent.click(await screen.findByRole("treeitem", { name: /^Clients/ }));
    fireEvent.click(await screen.findByRole("treeitem", { name: /Leroy — brief\.pdf/ }));
    expect(
      (await screen.findAllByRole("row", { name: /Leroy — brief\.pdf/ })).some(
        (r) => r.getAttribute("aria-selected") === "true",
      ),
    ).toBe(true);
  });

  it("a cited file in a site opens", async () => {
    renderApp();
    // A site page posts this message when its source link is clicked.
    // Open a site first so SiteViewer is mounted: use the Sites view and open "Dupont project".
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Activity bar" })).getByRole("button", {
        name: "Sites",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Dupont project/ }));
    const frame = (await screen.findByTitle(/Dupont project/)) as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "sandclaw:open-file", path: "Clients/Dupont — notes.md" },
          source: frame.contentWindow,
        }),
      );
    });
    expect(tab("Dupont — notes.md")).toHaveLength(1);
  });
```

(Import `ShowPanel` from contracts.) The roles and names above are this plan's best reading of the components; read each component first and use the names it really renders (`treeitem` vs `row`, the site's title, how a source card is labelled), keeping each test's intent — the click a person makes, and the file tab or selected row they then see. List every such adjustment in the report.

- [ ] **Step 2: Run them** — FAIL.

- [ ] **Step 3: The component callbacks** — each optional; without it, unchanged behaviour:
  - `TodosView`: with `onOpenFile`, the by-file group header (`todos-view.tsx` ~:90) and the flat list's file label (~:61) become `<button type="button" aria-label={`Open ${path}`} onClick={() => onOpenFile(path)}>` with the same text and classes (plus `hover:underline`); without it, the current span/div.
  - `AssistantPanel`: pass `onOpenFile` down to `TaskCard`; the output buttons (~:110) get `onClick={() => onOpenFile?.(o.file)}`.
  - `grounded-answer.tsx`: `export const OpenSourceContext = createContext<((source: Source) => void) | null>(null);` In `SourcePreview`, `const openSource = useContext(OpenSourceContext);` — with it, "Open file" is wrapped in `DialogClose asChild` and calls `openSource(source)`; without it, today's text.
  - `IndexingTree` (`indexing.tsx`): `IndexingProps` gains `onReveal?(path: string)`; a click on a *file* row (~:614, where folders toggle) calls it.
  - `SiteViewer`: `onOpenFile?(path)`; the message handler calls it when given, else today's notice. `Sites`: `onOpenFile?` passed through to its `SiteViewer`.

- [ ] **Step 4: Wire the features** (use `useAppRuntime()` inside small components so `render()` stays a plain function):
  - `todos.tsx`: render `<TodosLinked />` = `TodosView` with `onOpenFile={(path) => commands.call(OpenFile, { path })}`.
  - `assistant.tsx`: the Assistant view passes `onOpenFile` the same way; the "How it was answered" view wraps its content in `<OpenSourceContext.Provider value={(s) => commands.call(OpenFile, { path: s.path, citation: { question: dupontStart.question, blockId: s.blockId } })}>`; wrap the Conversations view in the same provider with `question: ""` replaced by the source's own answer when available — if not reachable, use the provider only for "How it was answered" and note it.
  - `indexing.tsx`: `IndexingTree onReveal={(path) => commands.call(RevealFile, { path })}`; Explore: `<IndexExplorer onOpen={(path) => commands.call(RevealFile, { path })} />`.
  - `sites.tsx`: `<Sites layout="rows" onOpenFile={(path) => commands.call(OpenFile, { path })} />`.

- [ ] **Step 5: Run** — focused, then full checks; every existing story and test of these components stays green.

- [ ] **Step 6: Commit** — `feat(ui-protos.app): links from todos, assistant outputs, citations, indexing, Explore and sites to their files`.

---

### Task 4: Navigation links — notifications, the table of contents, Team, the pill

**Files:**
- Modify: `src/notifications/inbox.ts` (`NoticeTarget`, `Notice.target?`), `src/notifications/notices-mock.ts` (targets), `src/notifications/notifications.tsx` (`onOpen?`)
- Modify: `src/group-status/group-status.tsx` (`GroupPill` `onClick?`)
- Modify: `src/app/features/activity.tsx`, `mesh.tsx`, `sites.tsx`
- Test: `test/app-links.test.tsx` (append)

**Interfaces:**
- Produces: `type NoticeTarget = { kind: "file"; path: string } | { kind: "site" } | { kind: "settings"; section: string } | { kind: "team" }`; `Notice.target?: NoticeTarget`; `Notifications({ …, onOpen?(target: NoticeTarget) })`; `GroupPill({ state, onClick? })`; center view `site-toc` (TocEditor) in the Sites feature.

- [ ] **Step 1: Write the failing tests** — append (new `describe("navigation links")`):

```tsx
  const bell = () => screen.getByRole("button", { name: /^Notifications/ });

  it("a notice about a file opens it", async () => {
    renderApp();
    fireEvent.click(bell());
    fireEvent.click(await screen.findByRole("button", { name: /Update the Dupont offer/ }));
    expect(tab("Dupont — offer.docx")).toHaveLength(1);
  });

  it("a notice about unreadable files opens Settings › What the assistant reads", async () => {
    renderApp();
    fireEvent.click(bell());
    fireEvent.click(await screen.findByRole("button", { name: /couldn't be read/ }));
    const nav = await screen.findByRole("navigation", { name: "Settings sections" });
    expect(
      within(nav).getByRole("button", { name: "What the assistant reads" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("a notice that targets an admin section opens the first one for a member", async () => {
    const rt = renderApp({ viewer: "member" });
    act(() => {
      rt.commands.call(OpenSettings, { section: "services" });
    });
    const nav = await screen.findByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getByRole("button", { name: "Me" }).getAttribute("aria-current")).toBe("page");
  });

  it("the group pill shows the Team view", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /Atelier Morel/ }));
    const bar = screen.getByRole("navigation", { name: "Activity bar" });
    expect(within(bar).getByRole("button", { name: "Team" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Manage team… opens Settings › Team for an admin; a member has no such button", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /Atelier Morel/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Manage team…" }));
    const nav = await screen.findByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getByRole("button", { name: "Team" }).getAttribute("aria-current")).toBe("page");
    cleanup();
    renderApp({ viewer: "member" });
    fireEvent.click(screen.getByRole("button", { name: /Atelier Morel/ }));
    expect(screen.queryByRole("button", { name: "Manage team…" })).toBeNull();
  });

  it("Edit table of contents opens the table-of-contents editor", async () => {
    renderApp();
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Activity bar" })).getByRole("button", {
        name: "Sites",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Dupont project/ }));
    fireEvent.click(await screen.findByRole("button", { name: /table of contents/i }));
    expect(tab("Table of contents")).toHaveLength(1);
  });
```

(Import `OpenSettings`.) As in Task 3, read the components and use the names they really render, keeping the intent; list adjustments.

- [ ] **Step 2: Run them** — FAIL.

- [ ] **Step 3: Notices carry targets** — `inbox.ts`: export `NoticeTarget` (above) and add `target?: NoticeTarget` to `Notice`. `notices-mock.ts`: give `notice()` an optional `target` argument and set: `n_wait` → `{ kind: "file", path: "Clients/Dupont — offer.docx" }`; `n_paul` → `{ kind: "team" }`; `n_unread` → `{ kind: "settings", section: "indexing" }`; the `site-built` notice → `{ kind: "site" }`; a `service-down` notice, if any → `{ kind: "settings", section: "services" }`; a `device-added` notice, if any → `{ kind: "settings", section: "me" }`.
- [ ] **Step 4: `Notifications` `onOpen?(target)`** — in `openGroup`, after the existing marking, `const target = g.notices.find((n) => n.target)?.target; if (target && onOpen) { onOpen(target); close(); }` (the stand-in area's "Would open — …" text stays for the non-embedded stories).
- [ ] **Step 5: `GroupPill` `onClick?`** — pass it to the button (the tooltip stays).
- [ ] **Step 6: Wire the features:**
  - `activity.tsx`: the bell passes `onOpen` mapping file → `OpenFile {path}`, site → `ShowPanel {id: "sites"}`, settings → `OpenSettings {section}`, team → `ShowPanel {id: "team"}` (a small component using `useAppRuntime()`).
  - `mesh.tsx`: the pill's `onClick` → `ShowPanel {id: "team"}`; the Team view, for an admin, renders a top-right `Button size="sm" variant="outline"` "Manage team…" → `OpenSettings {section: "team"}` above `TeamOneList`.
  - `sites.tsx`: register a center view `{ id: "site-toc", title: "Table of contents", Icon: ListTree, zone: "center", render: () => <PanelPage><TocEditor /></PanelPage> }` (check `TocEditor`'s required props in `src/site-toc/toc-editor.tsx` and pass its story's defaults); `Sites onEditToc={() => commands.call(ShowPanel, { id: "site-toc" })}`.
- [ ] **Step 7: Run** — focused, then full checks; the Notifications, group-status and Sites stories and tests stay green.
- [ ] **Step 8: Commit** — `feat(ui-protos.app): notices, the group pill, Team's Manage and the table of contents link where they point`.
