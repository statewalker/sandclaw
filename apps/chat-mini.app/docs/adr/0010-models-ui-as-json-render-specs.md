# ADR 0010 — Model-management UI is published as json-render specs over the shadcn catalog

Date: 2026-05-15
Status: accepted

## Context

The `models-config` fragment owns three dialogs — Models List,
Remote Connections, Local Models — plus the chat composer's
starred-models quick-pick. Every other UI fragment in chat-mini
to date implements its surface as bespoke React components
mounted via `core:views`:

- `chat-react/ChatRoot`, `dock-react/MainShell`,
  `workspace-bridge-react/WorkspacePicker`,
  `settings-react/SettingsDialog`,
  `ai-providers-react/{ProviderConfigPanel, ComposerModelPicker}`.

The app *ships* `@json-render/{core,react,shadcn}` and uses
json-render for one thing only: each dock panel is a json-render
spec with a single bespoke anchor element (e.g.
`chat:{ChatRoot{sessionId}}`,
`file-explorer:{FileExplorerView{panelId}}`). The shadcn catalog —
which provides ~30 primitives (`Dialog`, `Card`, `Stack`,
`Grid`, `Input`, `Select`, `Table`, `Progress`, `Badge`,
`Button`, `Tabs`, `Switch`, etc.) plus a state model with
`$state` / `$bindState` / `$bindItem`, repeat scopes, visibility,
validation, and actions — is not yet exercised at full
expressive power anywhere in this app.

The model-management surface has the shape that justifies that
expressive power:

- Three coupled dialogs that share state (a model selected in
  Local Models becomes visible in Models List; "starred" reflects
  back in the composer).
- Form-heavy (Add / Edit Connection with `type` dropdown,
  validated fields, a `headers` repeater).
- Lists with filters (provider type, capability, search,
  starred-only) and a detail right-pane.
- A single concrete UI specification (rectangle layouts in the
  notes from 2026-05-15) — so the spec can be authored once and
  reviewed before any React is written.

Implementing this surface as bespoke React would duplicate
~30 shadcn primitives in slightly different combinations per
dialog. Implementing it as json-render specs is a structurally
better fit, but introduces three patterns the codebase has not
exercised before:

1. **Multi-element json-render specs.** Today's specs have one
   anchor element. The Models List dialog alone needs ~15
   elements (Dialog → Stack[search, filters, list, detail-pane]
   → repeat ...).
2. **Mounted via `dock:overlays`, not via dock panels.**
   `JsonPanel` in `dock-react` only mounts inside `dockview-react`
   panels. The dialogs need to mount alongside `MainShell`, the
   same surface settings-react uses for its dialog.
3. **Reactive bridge from a workspace adapter into the
   json-render `StateStore`.** Today's specs are seeded once and
   patched only via `SpecStore.patch`. The Models List has to
   reflect external state changes (a download completing, a new
   Connection being added in another tab) live.

If we are going to do this once for `models-config`, we should
do it deliberately so the pattern generalises and so future
fragments (the next dialog-heavy surface) know what to follow.

## Alternatives considered

1. **Bespoke React, mirroring `ai-providers-react`.** Three
   React dialog components mounted via `dock:overlays` viewKeys
   (one per dialog), backed by the workspace `Providers` /
   `LocalModels` adapters. Pros: no new pattern; fits exactly how
   `settings-react` works. Cons: high JSX volume; every shadcn
   primitive (Dialog, Input, Select, Badge, repeat-with-add-row)
   has to be glued together by hand in three places; the
   declarative shape of "this dialog has these fields, these
   filters, this validation" is hidden inside imperative React.
2. **Settings-tab approach (one big tab in the settings
   dialog).** Reuse `settings-react`'s tab surface; put Models /
   Connections / Local on three sub-tabs. Pros: reuses an
   existing surface. Cons: hides Models behind Settings →
   Providers (worse discoverability for a frequent action); the
   composer's "All models…" entry still needs to *jump to that
   tab*, which is what `OpenProviderConfigCommand` already does
   today and which we are explicitly replacing.
3. **JSON-render spec over shadcn catalog, mounted via
   `dock:overlays` (this ADR).** Pros: declarative surface;
   exercises the json-render investment for its intended use
   case; sets the precedent for future declarative dialogs.
   Cons: introduces three new patterns (above).

## Decision

Adopt **alternative 3**.

### Single spec, three Dialog elements

`models-config` publishes **one** json-render spec with three
shadcn `Dialog` elements as siblings under a transparent root.
Each Dialog has its own `openPath` (`/ui/dialogs/modelsList/open`,
`/ui/dialogs/remoteConnections/open`, `/ui/dialogs/localModels/open`).
The three commands (`select-model`,
`manage-remote-connections`, `manage-local-models`) each set
their corresponding openPath to `true`.

A single spec (rather than three) is chosen because the
dialogs *share state* — for example, "Add Connection" success
in the Connections dialog adds a row to the Models List in the
background, and the spec can express that with one
`$state: /persistent/connections` reference rather than three
separate sync paths.

### Mount via `dock:overlays`

`models-config` (logic) contributes one entry to `dock:overlays`:
`{ id: "models-config", viewKey: MODELS_CONFIG_OVERLAY_VIEW_KEY }`.
`models-config-react` (renderer) registers
`<ModelsConfigOverlayHost>` into `core:views` under that viewKey.
The host renders `<JSONUIProvider><Renderer/></JSONUIProvider>`
against the spec and a renderer-owned `StateStore`. The dock
fragment already mounts every `dock:overlays` viewKey alongside
`MainShell`; no dock changes are needed.

### Two-segment state model + renderer-side bridge

The state model has two top-level segments:

- `/persistent/*` — `connections`, `starred`, `local.downloaded`,
  `active`. Mirrored from `Providers.config` (and the new
  `LocalModels` adapter) by a subscription inside
  `<ModelsConfigOverlayHost>`. On every adapter `notify()`,
  the host calls `store.update({ "/persistent/connections": ...,
  ... })`. Writes initiated from the spec (e.g.
  `saveConnection`) flow through actions that call workspace
  commands; the resulting adapter update re-flows into
  `/persistent/*` and closes the loop.
- `/ui/*` — dialog open flags, search query, capability filter
  selection, the in-progress connection form, the currently
  selected model in the right-pane, the active download phase.
  Pure in-memory; no persistence.

The host instantiates the `StateStore` once per workspace
session. Commands listened to from inside the host fire
`store.set("/ui/dialogs/<name>/open", true)`.

### Custom `Markdown` catalog primitive

The shadcn json-render catalog has no markdown primitive; the
Models List / Local Models right-pane description requires one
(formatted capabilities lists, model-card text). `models-config`
declares its own catalog (`models-config` catalog id) that:

- Re-exports the shadcn catalog's components and actions.
- Adds `Markdown: { props: { source: z.string() } }`.

`models-config-react` registers the catalog into
`json:catalogs`, supplying the React binding for `Markdown` that
wraps the existing `@statewalker/markdown-viewer-react`
rendering pipeline (already in the bundle).

This is the **first** local catalog in the app that extends the
shadcn catalog with a bespoke primitive. The pattern — one
catalog id per fragment, bindings registered renderer-side via
`json:catalogs`, used by that fragment's spec — generalises
cleanly. Future fragments that need a bespoke primitive (e.g. a
drag-and-drop file row, a colour-picker) follow the same shape.

### Tests

- Spec validation: the published spec is validated with
  `validateSpec` in a unit test in `models-config/src/internal`.
- State-bridge: an integration test mounts the host against a
  fake `Providers` adapter, calls `selectModelCommand`, and
  asserts `/ui/dialogs/modelsList/open === true` in the store.
- Migration: the v3→v4 `providers.json` migration is covered in
  `providers-store.test.ts` (already the test surface for
  v1→v2 and v2→v3 migrations).

## Consequences

- **JSON-render's full expressive surface is exercised.** Forms,
  validation, repeat scopes, visibility, action handlers,
  controlled state stores — all in one fragment. Patterns become
  reviewable in one place.
- **Reviewable spec as source of truth.** The dialog layouts
  live as a JSON spec in `models-config/src/public/`. A
  designer or PM can read them without reading React; the
  next iteration can change layout by editing JSON.
- **Two new substrate patterns:** "fragment-local json-render
  catalog extending shadcn" and "renderer-side bridge from
  workspace adapter to json-render StateStore". Both are
  documented in CONTEXT.md alongside the fragment.
- **`ai-providers-react` is removed entirely.** Its two
  contributions (`ProviderConfigPanel`, `ComposerModelPicker`)
  are subsumed by the new dialogs and the new composer picker.
- **Dependency footprint of `models-config-react` is small** —
  it pulls `@json-render/{core,react,shadcn}` (already in the
  bundle), `markdown-viewer-react` (already in the bundle), and
  the catalog re-export. No new third-party.

## Why this is hard to reverse

Once the dialogs ship as a json-render spec and the composer's
"All models…" entry routes through `select-model`, replacing
this with a bespoke React surface would mean re-implementing
three full dialogs (Models List, Remote Connections, Local
Models) plus the form validation, the filtering, the
right-pane, and the state-bridge logic in JSX. The migration
direction (declarative → imperative) is mechanically larger
than the original write (imperative → declarative) would have
been. Worse, the `models-config` catalog with its `Markdown`
extension would also need a destination, and there is none —
the shadcn catalog is upstream-owned.

This ADR is therefore the moment at which the pattern is
committed for the app; future fragments either follow it (and
get the benefit of the same primitives + bridge) or stay
bespoke React (and re-glue from primitives by hand).
