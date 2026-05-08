# ADR 0002 — Two-layer architecture: logic fragments and renderer fragments

Date: 2026-05-08
Status: accepted

## Context

The fragment model so far (ADR 0001 + the platform proposal) treats
each fragment as a single unit owning intents, slot declarations,
adapter classes, and React views together. View components live
under `internal/views/`. This works for a single-target React app
but couples each feature's logic to one rendering technology.

Three forces push toward separating logic from rendering:

1. **Reuse across rendering surfaces.** `@json-render/shadcn` ships
   36 prebuilt components covering forms, tables, dialogs, cards,
   tabs. Most fragment views (settings dialog, provider config,
   directory picker) can be expressed as json-render specs against
   that catalog. Today they're hand-rolled React. Reuse demands
   declarative views.
2. **Sample-shell precedent.** `app.shell`'s `main.ts` already
   separates the two layers explicitly: feature fragments
   (`initFilesPanel`, `initAiConfig`) produce *view models*; a
   single `initAppShadcnUi` activates the React rendering. Logic
   fragments contain no React imports there, by convention. The
   chat-mini platform should mirror this.
3. **Testability.** Logic fragments without React run in plain
   Node. Tests don't need jsdom or React Testing Library — they
   exercise intents and slot contributions directly. The renderer
   layer is tested separately with React Testing Library.

## Alternatives considered

1. **Status quo: each fragment bundles logic + React views.**
   Pros: locality (everything for a feature in one place), fewer
   fragments to wire. Cons: every fragment imports React;
   declarative-view reuse is hard; can't run logic-only tests
   without DOM.
2. **Per-fragment opt-in: split when a fragment becomes "big
   enough".** Pros: fewer fragments at first. Cons: inconsistency
   — some fragments are split, some aren't; reviewers and
   plug-in authors can't predict the shape.
3. **Strict two-layer split (this ADR).** Every fragment with
   React content splits into a logic fragment + a paired
   renderer fragment. Pros: uniform, testable, reusable. Cons:
   more fragments to wire; cross-fragment view contracts
   (slot value shapes) become more constrained — no React
   functions in slot values.

## Decision

Adopt **alternative 3**: strict two-layer split.

### Layer 1 — Logic fragments

Folder name: `<fragment>/`. Examples: `chat`, `dock`, `settings`,
`providers`, `workspace-bridge`. They:

- Declare intents, slot declarations, adapter classes.
- Declare json-render **catalogs** (typed component schemas — pure
  data, no React).
- Build **specs** (JSON view definitions referencing catalog
  components).
- Manage state via managers (re-entrant per ADR 0001).
- **Import zero React.** Lint rule:
  `no-restricted-imports`: `react`, `react-dom`, `react/*` from
  any file under `fragments/<logic-fragment>/**`.

### Layer 2 — Renderer fragments

Folder name: `<fragment>-views/`. Examples: `chat-views`,
`dock-views`, `settings-views`, `providers-views`,
`workspace-bridge-views`. They:

- Import React, json-render's React renderer, and `@json-render/shadcn`.
- Register concrete React components for catalog component names
  declared by their paired logic fragment.
- Contribute named React components to a workspace-scoped
  `ViewRegistry` (string-keyed) so logic fragments can reference
  them by viewKey from slot values.

### Plus one core-renderer fragment

`core-views/` (or `app-views/`). Mounts the rendering subsystem:

- Activates `@json-render/shadcn`'s 36 prebuilt component
  bindings.
- Registers the `ViewRegistry` adapter on the workspace.
- Mounts the React root; renders the App component which
  switches between `<DirectoryPickerEmptyState>` and `<DockHost>`
  based on workspace state.

### Boot order

```ts
// Layer 1 — logic only (no React)
register(initSpecStore(ctx));
register(initCatalogRegistry(ctx));
register(initWorkspaceBridge(ctx));
register(initSettings(ctx));
register(initProviders(ctx));
register(initAgentRuntime(ctx));
register(initFiles(ctx));
register(initInlineContent(ctx));
register(initChat(ctx));
register(initDock(ctx));

// Layer 2 — renderers (activate React)
register(initCoreViews(ctx));            // ViewRegistry, shadcn bindings,
                                          //  mounts React root + App
register(initWorkspaceBridgeViews(ctx));
register(initDockViews(ctx));
register(initSettingsViews(ctx));
register(initProvidersViews(ctx));
register(initChatViews(ctx));
```

Logic must register first so catalogs/intents/slots exist before
renderers bind to them.

### Slot value shapes

Slot values are **pure data** — never React functions. Two patterns:

- **Pattern A — full spec.** Slot value carries a json-render spec.
  Used when the contributed view is structurally rich and
  expressible against `@json-render/shadcn`'s catalog. Example:
  `settings:tabs` → `{ id, title, order?, spec: Spec }`.
- **Pattern C — viewKey lookup.** Slot value carries a string
  pointing into `ViewRegistry`. Used when the view is a single
  specialized React component that the renderer fragment must
  build (chat tool-call rendering, dock-host special widgets).
  Example: `chat:turn-blocks` → `{ kind, viewKey: string }`.

For action-style slots (composer buttons, command-palette items),
the slot value is purely command data — no view at all. Example:
`chat:composer-actions` → `{ id, label, icon?, hotkey?, action: IntentName, order? }`.
The renderer side renders these as buttons that fire the intent.

For json-render catalog contributions
(`inline-content:components`), the slot carries `{ name, schema,
description? }` (catalog declaration). The paired renderer
fragment binds the React component for that name into the
fragment's registry.

### Reuse direction

When a fragment needs UI, the order of preference is:

1. Express as a json-render spec against `@json-render/shadcn`'s
   prebuilt catalog (no custom React).
2. Express as a json-render spec against a small fragment-specific
   catalog rendered by the paired renderer fragment (some custom
   React, but as named registry entries).
3. Hand-roll React only when 1 and 2 don't fit (chat surface,
   dock-view host wrapper).

The chat surface remains opaque (one-element spec hosting
`ChatRoot`, per Option β) — the imperative React tree inside is
genuinely custom and shouldn't be expressed declaratively.

## Consequences

- **Fragment count roughly doubles** for fragments that today have
  React views. Acceptable cost for the testability + reuse wins.
- **Slot values are JSON-serializable** — opens future
  cross-process plug-in transport (postMessage, signed registry).
- **Logic-fragment tests run in Node** without DOM setup.
- **Plug-in authors can ship logic-only fragments** that
  contribute slot values referencing existing viewKeys in
  `ViewRegistry`, no React needed. Renderer fragments are
  optional per plug-in.
- **No "render: React.FC" in slot interfaces** — all such
  contributions go through `viewKey` or full specs.
- The "no React in logic fragments" rule is enforced by an
  `no-restricted-imports` lint rule, not by review.

## Why this is hard to reverse

A fragment written with React imports inline cannot be retroactively
proved logic-only without auditing every file. Establishing the
rule before fragments are written means new code is correct by
construction. Retrofitting later means moving every view, splitting
every slot interface, and rewriting every test — large diff
across every feature.
