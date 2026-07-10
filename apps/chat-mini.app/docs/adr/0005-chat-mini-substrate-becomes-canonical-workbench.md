# ADR 0005 — chat-mini's fragment substrate becomes the canonical workbench

Date: 2026-05-09
Status: accepted

## Context

Two parallel substrates exist in the umbrella today:

- **Legacy workbench** — `@statewalker/workbench-views`,
  `workbench-react`, `workbench-react-shadcn`,
  `workbench-react-spectrum`, `workbench-dom`, plus
  `@statewalker/app-shell`. Consumed by `explorer.app` and the
  abandoned commander-style UX (`explorer.api`, `explorer.core`,
  `explorer.ui`, `explorer.views`).
- **chat-mini.app's in-app fragments** — built fresh per ADRs 0001
  (lifecycle), 0002 (logic/renderer split), 0003 (core mount), 0004
  (workspace shell adapter). Lives in `chat-mini.app/src/fragments/`.
  Cleaner factoring; logic-fragment tests run in Node; renderer
  fragments register components into a workspace-scoped registry;
  intents and slots replace ad-hoc context wiring.

Three forces push toward consolidating onto chat-mini's substrate:

1. **Two substrates is one too many.** Every shared concern
   (theming, dock, settings, file management) has two
   implementations. Bug fixes and feature work split across both.
2. **chat-mini's substrate is the better one.** It was built after
   `app-shell` with the lessons learned (workspace-scoped adapters,
   reentrant managers, ADR 0002's logic/renderer split, json-render
   as the default declarative-view path). Migrating chat-mini
   *back* to legacy workbench would lose those properties.
3. **Commander UX is dead weight.** `explorer.core` is 3,189 LOC of
   which roughly a third is commander-specific scaffolding
   (button-bar, menu-bar, command-line, panel-bridge, test panel).
   None of this is referenced outside the commander UX, and the
   commander UX has no live consumers. Migrating it costs more than
   re-deriving the few file-browser features that *do* matter
   (tree, list, dnd, navigation, search) onto the new substrate.

## Alternatives considered

1. **Status quo — keep both substrates.** Pros: no migration cost.
   Cons: doubled maintenance forever; chat-mini and explorer can't
   share fragments; bug fixes diverge; new contributors can't tell
   which substrate to extend.
2. **Migrate chat-mini onto legacy workbench.** Pros: explorer
   already runs on it. Cons: regresses every ADR 0001–0004
   property; chat-mini's logic-fragment tests would re-acquire DOM
   coupling; `IdentifiableRegistry`/slot rule rework loses ground.
3. **Build a new third substrate.** Pros: clean slate. Cons:
   throwaway work — chat-mini already *is* a clean substrate;
   building a third just adds a substrate without retiring either
   existing one.
4. **Invert: chat-mini's substrate becomes canonical (this ADR).**
   Extract chat-mini's in-app fragments to published
   `@statewalker/*` packages; explorer.app rebuilds onto them;
   legacy workbench packages and the commander-only halves of
   explorer retire. Pros: single substrate; chat-mini and explorer
   share fragments; ADR 0001–0004 properties preserved. Cons:
   one-time migration cost; `chat-mini.app` is briefly broken
   during the cutover (accepted).

## Decision

Adopt **alternative 4**: invert. chat-mini's substrate becomes the
canonical workbench.

### Package extraction

chat-mini.app's `src/fragments/` extracts into three workspaces:

- **`statewalker-workbench/packages/`** (generic substrate) —
  `core-react`, `shadcn-react`, `dock`, `dock-react`, `files`,
  `files-react`, `file-explorer`, `file-explorer-react`,
  `settings`, `settings-react`, `workspace-bridge`,
  `workspace-bridge-react`, `inline-content`,
  `inline-content-react`, `json-render` (merged former
  `catalog-registry` + `spec-store`), and the four per-MIME viewers
  (`image-viewer-react`, `markdown-viewer-react`,
  `pdf-viewer-react`, `video-viewer-react`).
- **`statewalker-ai/packages/`** (AI substrate) —
  `ai-agent-runtime`, `ai-providers`, `ai-providers-react`.
- **`statewalker-apps/apps/chat-mini.<name>/`** (chat-mini-specific) —
  `chat-mini.chat`, `chat-mini.chat-react`. Siblings of the
  `chat-mini.app` shell.

Total: 23 business packages + 2 app shells.

### File-management split

The file-management surface splits two ways:

- **`files` + `files-react`** — file ops (load/write/move/delete/
  mkdir/rename/visualize), `files:*` slots, agent-tool
  contribution, `pickMimeRenderer` selector. Consumed by both
  chat-mini.app (agent + visualize) and explorer.app (browser
  backend).
- **`file-explorer` + `file-explorer-react`** — interactive
  browser UX surviving the commander cull: tree, list, dnd,
  context menu, navigation breadcrumbs, search panel.
  Required by explorer.app; chat-mini.app omits unless/until
  it grows a permanent file panel.

### Retirements

In one OpenSpec change: `workbench-views`, `workbench-react`,
`workbench-react-shadcn`, `workbench-react-spectrum`,
`workbench-dom`, `app-shell`, `explorer.api`, `explorer.core`,
`explorer.ui`, `explorer.views` — all delete. Shadcn primitives
migrate into `shadcn-react`. Theme binding folds into `core-react`.
Spectrum can be reintroduced later as a new `spectrum-react`
following the same Slots contract.

### Migration scope

Single OpenSpec change `fragmentize-workbench-and-collapse-explorer`.
Big-bang because phasing leaves long-lived parallel substrates
during extraction; chat-mini.app downtime during the change is
accepted.

## Consequences

- **Single substrate** — chat-mini and explorer share fragments;
  bug fixes and features land once.
- **chat-mini.app keeps its CONTEXT.md as the canonical reference**
  for the workbench architecture; future workbench-level
  documentation may move out, but for now chat-mini.app is the
  workbench's home.
- **explorer.app shrinks dramatically** — it becomes a thin
  manifest selecting workbench fragments + a small `files`
  config for the two-pane preset.
- **~3k LOC of commander-only code deletes** along with
  `explorer.api/.core/.ui/.views`.
- **chat-mini.app boots are briefly broken** during the
  big-bang migration. Accepted; the migration ends with both
  apps booting on the new substrate.
- **Cross-repo cascade** — each substrate package bumps a
  gitlinked sub-repo, then umbrella bumps gitlinks once. One
  coordinated cascade rather than many.

## Why this is hard to reverse

Once `workbench-*` and `explorer.api/.core/.ui/.views` packages
are deleted from their gitlinked sub-repos, restoring them means
reverting commits across multiple repos and reintroducing the
two-substrate maintenance burden. The cleaner the new substrate
is at extraction time, the less appetite anyone has to revert.
The grilling rounds (captured in
`notes/2026-05/2026-05-09/03.chat-mini-fragmentization-plan.md`)
front-load that cleanup work so the post-migration substrate is
worth not reverting.

## Amendment 2026-05-10 — implementation deltas

The substrate migration landed via OpenSpec change
`fragmentize-workbench-and-collapse-explorer`. Three implementation
details deviate from the design captured above; the original decisions
still hold but the deltas should travel with the ADR:

1. **Tailwind v4 `./styles` contract is augmented by app-side
   enumeration.** D6 in the change's design.md said each `-react`
   package's `./styles` CSS would carry `@source "./**/*.{ts,tsx}"`
   and that would discover the package's classes when imported by the
   host app. In practice Tailwind v4 treats `node_modules` as
   gitignore-excluded, so a `@source` directive resolved into a
   `node_modules/.../src/**/*.tsx` glob picks up zero files. The fix
   is workspace-relative `@source` globs in `chat-mini.app/src/index.css`
   anchored at the umbrella root (`../../../../statewalker-workbench/
   packages/*/src/**/*.tsx` etc.). The original design rejected
   "app-side enumeration" because it cited `node_modules` paths
   ("pnpm hoisting makes node_modules paths fragile") — the rejection
   does not apply to workspace paths, which are stable. Per-package
   `./styles` CSS files are kept (with the `@source` directive split
   into `*.tsx` and `*.ts` because Tailwind v4 rejects brace
   expansion at parse time) for in-tree clarity but are no-ops for
   cross-package class discovery.

2. **`useAdapter` and `useAppWorkspace` live in `core-react`, not
   `workspace-bridge-react`.** The design.md's "Open Questions" left
   this as deferrable. Implementation found a circular dep:
   `dock-react`'s `MainShell` consumes `useAdapter`, while `core-react`
   already depends on `workspace-bridge-react` for `AppWorkspaceProvider`
   and `DirectoryPickerEmptyState`. Routing `useAdapter` through
   `workspace-bridge-react` would close the cycle. Moving `useAdapter`
   + `useAppWorkspace` (which it depends on) into `core-react` breaks
   the cycle cleanly. `workspace-bridge-react` retains
   `<DirectoryPickerEmptyState/>`, `<ReconnectBanner/>`, and the
   header components.

3. **`IdentifiableRegistry` and the three subclass adapter classes
   were retired by replacing call sites with `KeyedSlot<T>` over slot
   keys** (per ADR 0006 — task group 6 in the OpenSpec change). The
   slot-key constants (`CORE_VIEWS_SLOT_KEY`, `JSON_CATALOGS_SLOT_KEY`,
   `INLINE_CONTENT_RENDERERS_SLOT_KEY`) and matching
   `newXxxRegistry(workspace)` / `useXxxRegistry()` helpers live in
   the slot's owning package.
