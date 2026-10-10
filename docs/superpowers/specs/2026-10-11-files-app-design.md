# Files app — design

Date: 2026-10-11 · Owner: Mikhail Kotelnikov · Status: draft for review

## Purpose

A multi-panel file manager in the browser, in the spirit of Norton / Midnight Commander and of
the file panels of the Theia shell (`statewalker-shell-theia/packages/theia-file-panels`). It is
the **first Sandclaw application to implement** and must be useful on its own: no httpeers, no
chat. It browses, opens, copies, moves, renames and deletes files across several storages mounted
side by side: local folders, browser storage (OPFS) and any number of S3 buckets. Indexing and
search come later, on top of the same interfaces.

Success: a person mounts a local folder and two S3 buckets, opens three panels, drags files from
the local folder to a bucket, chooses Copy, sees byte progress, and opens the copied PDF from the
bucket in a viewer, all in one browser tab.

## Out of scope (this design)

- Full-text indexing and search: only the interfaces they will plug into (see *Search, later*).
- httpeers, groups, chat, the agent.
- Watching storages for outside changes (other tabs, other S3 clients): panels refresh on
  navigation, on Refresh and after our own operations.
- A trash. Deletion is permanent on every storage, and the UI says so.
- Firefox / Safari support for local folders (the File System Access API is Chromium-only);
  browser storage and S3 work everywhere.

## Phases

| Phase | Delivers | Where |
|---|---|---|
| **1. UI prototypes** | Storybook prototypes of every screen, running on in-memory storages: panels, breadcrumb, transfers, mounts settings, S3 connection test, vault. Design notes with variants and open questions. | `apps/ui-protos.app`, next to the other prototypes |
| 2. Core packages | `file-mounts.core`, `file-panels.core`: the React-free logic, tested against `MemFilesApi` and an S3 test server (RustFS in Docker). | `packages/` |
| 3. Views and app | `file-mounts.view.shadcn`, `file-panels.view.shadcn` as workbench fragments; `apps/files.app`; the `app-shell` option. | `packages/`, `apps/` |
| 4. Search | Full-text index over the mounts and a search box in the panel. | separate design |

Phase 1 logic is written so it moves into the phase 2 packages with little change: the pure
functions (transfer planning, clash names, breadcrumb siblings, S3 error classification, settings
validation) are the same code.

## Architecture

The app is built on the workbench shell (`@statewalker/app-shell` `bootShell`): its dock holds any
number of panels and viewer tabs, its viewers (Markdown, PDF, image, video) open files through
`files:open`, and it brings settings, the menubar, commands and themes.

```
apps/files.app ── bootShell({ provisionWorkspace: initMounts, logic, renderers })
   │
   ├─ file-mounts.core        mount table → one CompositeFilesApi = the workspace's FilesApi
   │     mount types: local-folder · opfs · s3 (· memory for tests)
   │     secret vault · settings store · testConnection
   ├─ file-mounts.view.shadcn Settings → Storage: list, add/edit, test, unlock
   ├─ file-panels.core        panel model (on explorer.core FilesListModel), breadcrumb,
   │     transfer planner + runner, operations, change events
   └─ file-panels.view.shadcn the panel dock kind, dialogs, progress strip
```

Package names follow `{domain}.{aspect}[.{modifier}]`. The mounts settings UI gets its own view
package (`file-mounts.view.shadcn`) because it belongs to the mounts domain and is reused by any
app that mounts storages, with or without panels.

**app-shell change.** `bootShell` hard-codes `initWorkspaceBridge` (one folder picked with
`showDirectoryPicker`) as the workspace provisioning. It gains an optional `provisionWorkspace`
option, defaulting to the bridge, so the Files app passes the mount table's provisioning instead.
`bootLogic` already takes it as a parameter.

**Relation to the existing explorer.** `@statewalker/explorer.core` (statewalker-kernel) is a
one-folder explorer panel with list, tree and search models and `file-explorer:*` prompts. The
file panels are a new dock panel kind; they reuse `FilesListModel` (entries, sort, filter, cursor,
selection) and the file display helpers, and add the breadcrumb, multi-panel transfers and
mount awareness. The explorer stays available; nothing in it changes.

## Storage: mounts

Every storage is a `FilesApi` (`@statewalker/webrun-files`). The mount table composes them with
`CompositeFilesApi` (`@statewalker/webrun-files-composite`) over an empty read-only root, each
mount at `/<key>`. The composed API is the workspace's files, so viewers and a later indexer see
every mount through one path space: `/archive/clients/dupont/offer.pdf`.

Ported from `theia-files-mounts/src/common` (plain TypeScript there), without Theia types:

```ts
export type MountTypeId = "local-folder" | "opfs" | "s3" | "memory";

export interface MountConfig {
  key: string;                       // path segment: unique, no "/ \ # ? %", not starting with "."
  name: string;                      // display name
  type: MountTypeId;
  config: Record<string, string>;    // never secrets
  readOnly?: boolean;
  mounted?: boolean;                 // false: remembered but unmounted
}

export interface MountField {
  name: string;
  label: string;
  kind: "text" | "secret" | "url" | "boolean" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
  default?: string;
}

export interface MountContext {
  interactive: boolean;              // a user gesture is available (permission prompts)
  secret(field: string): Promise<string | undefined>;   // throws SecretsLocked when locked
}

export interface MountType {
  readonly id: MountTypeId;
  readonly label: string;
  readonly fields: MountField[];
  isAvailable(): { ok: true } | { ok: false; reason: string };
  create(mount: MountConfig, ctx: MountContext): Promise<FilesApi>;  // throws NeedsUserGesture, SecretsLocked
  forget?(mount: MountConfig): Promise<void>;                        // drop stored handles
}

export type MountStatus =
  | { state: "mounted" }
  | { state: "needs-access" }        // local folder after reload: one click to Reconnect
  | { state: "locked" }              // vault locked
  | { state: "failed"; problem: Problem }
  | { state: "unmounted" };

export interface MountTable {
  readonly files: FilesApi;          // the composite, stable across changes
  list(): { config: MountConfig; status: MountStatus }[];
  apply(configs: MountConfig[]): Promise<FileChange[]>;   // diff: keep unchanged, (re)create others
  reconnect(key: string): Promise<MountStatus>;           // inside a user gesture
  onUpdate(listener: () => void): () => void;
}
```

Rules kept from the Theia version: `apply` diffs and keeps unchanged mounts; creation has a 15 s
timeout; a failed mount stays in the table with its status. Changed from it: a failed or locked
mount is **not** an empty folder: reading it raises a `MountUnavailable` error carrying the
status, so a panel shows the reason and Retry instead of an empty list.

**Persistence.** Mount configs are a JSON file in a system folder of browser storage (OPFS):
`/.files/mounts.json`. Local-folder handles are kept in IndexedDB, one key per mount. When OPFS is
unavailable, the app runs with in-memory settings and says so.

### Mount types

- **local-folder**: `showDirectoryPicker({ mode: "readwrite" })` → `BrowserFilesApi`. After a
  reload, permission is queried; only a click may request it (`needs-access` → Reconnect).
  Unavailable outside Chromium, with that reason.
- **opfs**: `navigator.storage.getDirectory()` → `mounts/<key>` → `BrowserFilesApi`.
- **s3**: `S3FilesApi` (`@statewalker/webrun-files-s3`) over `S3Client` (`@aws-sdk/client-s3`),
  called directly from the browser.
- **memory**: `MemFilesApi`, for tests and the prototypes.

### S3 settings

| Field | Notes |
|---|---|
| Name, key | key defaults from the name |
| Provider preset | AWS, Cloudflare R2, MinIO / RustFS, Backblaze B2, Wasabi, Other: fills endpoint pattern, region and path-style |
| Endpoint | https URL (http allowed only for `localhost`); trailing slash removed |
| Region | required for AWS; default from the preset, never silently `us-east-1` |
| Bucket | S3 bucket naming rules checked |
| Prefix | optional; normalised to `a/b/` |
| Access key ID, Secret access key | secrets: stored only in the vault |
| Path-style addressing | from the preset; editable |
| Read-only | the mount refuses writes (`readOnly` from webrun-files-composite) |

### Testing a connection

`testConnection(config, secrets, { signal }) → ConnectionReport` runs ordered checks and stops at
the first failure:

1. **endpoint answers** · 2. **keys accepted** · 3. **bucket exists** · 4. **listing allowed** ·
5. **writing allowed**: put then delete `.<key>-write-test-<random>` (skipped when read-only).

```ts
export interface ConnectionReport {
  ok: boolean;
  checks: { id: "endpoint" | "keys" | "bucket" | "list" | "write"; state: "ok" | "failed" | "skipped" | "not-run" }[];
  problem?: Problem;
}
export interface Problem {
  cause: "invalid-settings" | "unreachable" | "cors" | "bad-keys" | "clock-skew"
       | "no-bucket" | "denied" | "timeout" | "locked" | "needs-access" | "unknown";
  message: string;     // plain words, shown to the person
  detail?: string;     // the raw SDK / browser message, under "Details"
  fix?: { kind: "cors-rule"; json: string };   // ready-to-copy bucket CORS rule
}
```

Error classification (`classifyS3Error`), a pure function of the SDK error and the context:
`InvalidAccessKeyId`, `SignatureDoesNotMatch` → bad-keys; `RequestTimeTooSkewed` → clock-skew;
`NoSuchBucket` → no-bucket; `AccessDenied` / 403 → denied (naming the failing check);
abort after 15 s → timeout. A bare network failure (`TypeError: Failed to fetch`) is ambiguous
between CORS and an unreachable host, so the test sends an unsigned `fetch(endpoint, { mode:
"no-cors" })`: an opaque answer means the host is up and the signed request was refused by CORS
→ `cors` with a CORS rule for `location.origin` that lists the headers S3 calls need
(`authorization`, `content-type`, `x-amz-*`, including `x-amz-copy-source` and
`x-amz-metadata-directive` for copy and move) and exposes `ETag`; no answer → `unreachable`.

The test runs on the form's *Test connection* button and before every save. A save with a failed
test is possible only through an explicit *Save anyway* (for a bucket that is offline now).

## Secrets: the vault

Ported from `theia-secret-vault/src/common/secret-vault.ts`: a random AES-GCM-256 data key
encrypts `secrets.json`; the data key is wrapped by a key derived from a password (PBKDF2-SHA256,
600 000 iterations). Both files live in `/.files/` of browser storage. *Remember on this browser*
keeps the non-extractable derived key in IndexedDB for a silent unlock. Writes are serialised
across tabs with the Web Locks API.

```ts
export interface SecretStore {
  readonly state: "absent" | "locked" | "unlocked";
  create(password: string, remember: boolean): Promise<void>;
  unlock(password: string, remember: boolean): Promise<boolean>;   // false: wrong password
  lock(): void;
  get(account: string): Promise<string | undefined>;               // throws SecretsLocked
  set(account: string, value: string | undefined): Promise<void>;
  changePassword(oldPassword: string, newPassword: string): Promise<boolean>;
  forget(): Promise<void>;     // drop the remembered key
  reset(): Promise<void>;      // delete every secret; mounts stay, waiting for keys
  onUpdate(listener: () => void): () => void;
}
```

Accounts are `<mount key>/<field>`. The first S3 mount asks to create the password. At start-up,
S3 mounts are `locked` until unlock; other mounts mount normally.

## Panels

```ts
export interface PanelState {
  id: string;
  path: string;                      // "/" lists the mounts
  sort: { field: "name" | "size" | "lastModified"; descending: boolean };
}

export interface PanelModel {                // one per panel, over explorer.core FilesListModel
  readonly state: PanelState;
  readonly list: FilesListModel;             // entries, cursor, selection, filter
  readonly problem?: Problem;                // the folder cannot be read (mount unavailable…)
  navigate(path: string): Promise<void>;     // a newer navigation wins over a slower older one
  up(): Promise<void>;
  refresh(): Promise<void>;
  breadcrumb(): Crumb[];
  siblings(crumb: Crumb): Promise<{ name: string; path: string }[]>;  // the ▾ menu
  onUpdate(listener: () => void): () => void;
}

export interface Crumb { name: string; path: string; isMount: boolean }
```

- `breadcrumb()` of `/archive/clients/dupont` is `archive › clients › dupont`. `siblings` of a
  crumb lists the folders in its parent; for the first crumb it lists the mounts.
- A folder that disappears sends the panel to its nearest existing ancestor with a notice.
- Panel state (path, sort) is saved with the dock layout.
- Opening: a folder navigates in the panel; a file dispatches `files:open`.

## Transfers and operations

```ts
export type TransferOp = "copy" | "move";
export type ClashPolicy = "overwrite" | "keep-both" | "skip";

export interface TransferRequest {
  op: TransferOp;
  sources: string[];          // workspace paths
  targetDir: string;
  rename?: string;            // single source only: the new name
  clash: ClashPolicy;
}

export interface TransferStep { op: TransferOp; from: string; to: string; overwrite: boolean }
export interface TransferPlan { steps: TransferStep[]; clashes: string[]; invalid?: string }

planTransfer(files: FilesApi, request: TransferRequest): Promise<TransferPlan>;
runTransfer(files: FilesApi, plan: TransferPlan, opts: {
  signal?: AbortSignal;
  onProgress?(p: TransferProgress): void;
}): Promise<TransferResult>;

export interface TransferProgress { file: string; bytesDone: number; bytesTotal: number; itemsDone: number; itemsTotal: number }
export interface TransferResult { done: string[]; skipped: string[]; failed: { path: string; problem: Problem }[]; cancelled: boolean }
```

- **Planning** (ported from `transfer-planner.ts`): a folder into itself or its descendant is
  `invalid`; a drop into the source's own folder becomes Copy with a free name; *keep both*
  picks free names (`a copy.md`, `a copy 2.md`); sources clashing with each other never
  overwrite one another.
- **Running**: files are streamed (`read` → `write`) so byte progress is real and the signal
  stops mid-file. Folders are walked with `list({ recursive: true })` to count bytes first.
  Same-mount operations use the storage's own `copy` / `move` (S3 `CopyObject`, no download).
- **Safe overwrite**: the target is never removed before the copy succeeded. A copy writes over
  the target directly (`FilesApi.write` replaces it; an S3 PUT is atomic). A cross-mount move
  removes the source only after its copy succeeded; a failure leaves the source intact.
- A failed step does not stop the batch; the result lists failures with their `Problem`.
- **Import from the desktop**: `importDropped(dataTransfer)` reads the dropped items
  (`webkitGetAsEntry` for folders, recursively) into the same planner as a virtual source, so
  name clashes get the same dialog.
- **Other operations**: `mkdir`, `rename` (validates the name, refuses a clash), `remove` (after
  confirmation), `download` (a single file saved to the computer).

### Change events (for search, later)

Every operation and mount change emits `FileChange` events on one stream:

```ts
export interface FileChange { type: "added" | "updated" | "deleted"; path: string }
export interface FileChanges { subscribe(listener: (changes: readonly FileChange[]) => void): () => void }
```

Panels showing an affected folder refresh from it; an indexer will subscribe to the same stream.

## Search, later (interfaces only)

```ts
export interface SearchHit { path: string; title: string; snippet?: string; score: number }
export interface SearchProvider {
  readonly id: string;                    // "fulltext", later "semantic"…
  search(query: string, opts: { scope?: string; signal?: AbortSignal }): AsyncIterable<SearchHit>;
}
```

Phase 4 implements a full-text `SearchProvider` with `@statewalker/indexer-fulltext` +
`indexer-mem-flexsearch` and `content-extractors`, kept current by `FileChanges`, its index
persisted in `/.files/index/`. The panel's filter box gains a *Search in this folder* mode.

## UI

### A panel

- **Breadcrumb** at the top: a segment per folder, clicking one navigates; each segment's ▾
  opens a menu of the folders beside it at that level; the first segment's ▾ lists the mounts
  (with their status) and *Manage storage…*.
- **Toolbar**: Up, Refresh, New folder, filter box.
- **List**: Name, Size, Modified, sortable; folders first. Status line: items, selected count
  and size.
- **Keyboard**: arrows; Shift / Ctrl extend the selection; Ctrl+A; Enter opens; Backspace up;
  F2 rename; F5 copy; F6 move; F7 new folder; F8 / Delete delete; typing filters.
- **Context menu** on rows: Open, Open in new panel (folders), Copy to…, Move to…, Rename,
  Delete, Download, Copy path.
- **Panels**: Files → New panel, or *Open in new panel*; any number, split anywhere in the dock.
  An unavailable folder shows the problem with Retry (and Reconnect / Unlock when that is the
  cause).
- **Phone width**: the dock shows one panel at a time; drag and drop is off; Copy to… and
  Move to… work through the dialog.

### Transfers

- **Drag between panels**: a drop on a folder row, on a panel's empty area or on a breadcrumb
  segment opens the **Copy / Move dialog**: the operation (plain drop pre-selects Move,
  Ctrl / ⌥ pre-selects Copy), the target folder, and for one item an editable name with a
  warning when it exists; for several items with clashes, one choice: Overwrite, Keep both,
  Skip.
- **F5 / F6**: the same dialog; the target is the other panel, or a choice among the open
  panels' folders when there are several (the last used one first).
- **Drop from the desktop**: files and folders; the same dialog without the Move choice.
- **Progress strip** at the bottom of the dock: the current file, bytes done of total, items,
  Cancel; at the end a summary with the failures and their reasons.
- **Delete**: a confirmation naming the count and saying there is no trash.

### Storage settings

- Settings → **Storage**, also *Manage storage…* in the first breadcrumb menu.
- A row per mount: name, type, where it points, status (Mounted · Needs access → Reconnect ·
  Locked → Unlock · Failed → the reason, Details, Retry · Unmounted → Mount), and Edit, Unmount,
  Remove (forgets the handle and deletes the keys).
- **Add**: choose Local folder, Browser storage or S3 (an unavailable type is greyed with the
  reason). The S3 form has the fields above, *Test connection* with a tick or a cross per check,
  the problem in plain words, Details, and for CORS the rule to copy.
- **Vault**: create password (first S3 mount), unlock at start-up (with *Remember on this
  browser*), change password, forget this browser, reset.

## Errors, in the words the person sees

| Situation | Shown |
|---|---|
| S3 keys wrong | "Wrong access key or secret." |
| Clock off | "This computer's clock is off by more than 15 minutes; S3 refuses the request." |
| Bucket missing | "Bucket `name` not found at this endpoint." |
| Keys lack a right | "These keys can't list (write to) this bucket." |
| CORS | "The bucket doesn't allow this site. Add this CORS rule to the bucket:" + rule |
| Host down / wrong URL | "No answer from `endpoint`." |
| Timeout | "No answer in 15 seconds." |
| Vault locked | "Locked: unlock to use the S3 storages." |
| Local folder after reload | "Click Reconnect to give access to `folder` again." |
| Local folders unsupported | "This browser can't open local folders; use Chrome or Edge." |
| Transfer item failed | "`file`: <problem>" in the summary; the rest of the batch continues |

## Testing

Tests sit at public seams only.

- **Phase 1**: the prototype logic files (pure functions) and the rendered components with
  @testing-library/react over `MemFilesApi` mounts: navigate, breadcrumb siblings, plan and run a
  copy with each clash policy, cancel mid-batch, delete confirmation, the S3 form validation, the
  connection report rendering for each problem (from a fake S3 that fails on demand). Every story
  renders (`test/stories.test.tsx`) and fits 390 px without horizontal scroll.
- **Phase 2**: the core packages against `MemFilesApi`, `webrun-files-tests` suites for the
  composite, and an S3 integration suite against RustFS in Docker (skipped when Docker is
  absent): real `testConnection` outcomes for bad keys, missing bucket, denied write, CORS.
  The vault: create, unlock, wrong password, change password, reset.
- **Phase 3**: headless composition tests (`bootHeadless` with memory mounts): open a panel,
  `files:open` routes to a viewer, the mount table is the workspace's files.

## Dependencies to add to the catalog

`@statewalker/webrun-files-composite`, `@statewalker/webrun-files-s3`, `@aws-sdk/client-s3`
(phase 1 needs only `webrun-files-composite` and `webrun-files-mem`).

## Open questions

1. Should Move be the pre-selected choice for a plain drop (as in Theia), or Copy (safer across
   storages)? The design keeps Theia's rule; a cross-storage drop could default to Copy.
2. The Files app's own address and deployment: a static site on its own origin, which every S3
   bucket's CORS rule must list. One origin for all Sandclaw apps would need one rule.
3. Should Storage settings be per browser (now) or follow the person once httpeers exists?
4. Is a trash wanted later (a `.trash/` folder per mount)?
