# chat-mini.app — context

Domain language for the chat-mini platform. Terms here are
canonical; PRs that introduce new vocabulary should add an entry
or align with one that exists.

## Storage surfaces

Two `FilesApi` views on every workspace, separated by audience:

- **User files (`workspace.files`)** — what the user thinks of as
  the workspace. What a future file explorer panel browses. What
  the agent's file tools see (filtered to hide the system
  subtree).
- **System files (`workspace.requireAdapter(SystemFiles).files`)**
  — a FilesApi rooted at `<root>/.settings/`. Holds **all**
  fragment-persistent state: dock layout, providers config,
  sessions, model weights, secrets, settings.

Fragment managers persist through `SystemFiles`, never through
`workspace.files`. Only the `files` fragment (and mime-renderer
fragments resolving user-opened paths) touch user files directly.

The `Secrets` and `Settings` workspace adapters build on top of
`SystemFiles` — JSON-per-key storage under `secrets/` and
`settings/` respectively, with `BaseClass.notify()` reactivity.

## Architectural primitives

- **Fragment** — an `init(context: Record<string, unknown>) => () =>
  Promise<void>` function with `public/` and `internal/`
  sub-folders. The unit of registration. Public surface is the
  init function plus optional `commands.ts` (was `intents.ts` —
  renamed per ADR 0008) and `extension-points.ts`. Touches the
  boot context only inside
  `init`; everything below works with typed values.
  Per ADR 0002, fragments come in two flavors: **logic** and
  **renderer**.
- **Logic fragment** — name `<fragment>/`. Imports zero React.
  Owns commands, slot declarations, json-render catalog
  declarations, JSON specs, state managers, and adapter classes
  where justified per the Adapter rule below. Tests run in Node,
  no DOM.
- **Renderer fragment** — name `<fragment>-react/`. Imports React.
  Paired with a logic fragment; binds React components to its
  catalog component names; contributes named components to the
  `core:views` slot (a `defineKeyedSlot<ViewComponent>`
  declaration in `core-react`'s `public/`) so logic fragments
  can reference them by viewKey from slot values.
  (Suffix is `-react` post-fragmentization; earlier code uses
  `-views`.)
- **Renderer-only fragment** — a `<name>-react/` fragment with **no
  paired logic fragment**. Permitted when there is no per-feature
  business logic to own — the fragment registers React components
  (and any inert metadata they need, such as a MIME pattern) but
  has nothing Node-testable to split off. Canonical examples:
  - `core-react/` — activates `@json-render/shadcn`'s prebuilt
    bindings, declares the `core:views` slot, owns
    `createRoot`, mounts the React root, hosts the `AppRoot`
    component that switches between picker and main shell based
    on `WorkspaceShellAdapter`. Public surface re-exports the
    substrate hooks (`useSlot`, `useKeyedSlot`, `useAdapter`,
    `useAdapterValue`).
  - `shadcn-react/` — re-exports the local shadcn primitives
    (`Button`, `Card`, `Dialog`, `ResizablePanelGroup`, …) plus
    the `cn()` className helper. Other renderer fragments import
    primitives from here instead of from a non-fragment
    `src/components/` directory.
  - **Per-MIME viewers** — `image-viewer-react/`, `pdf-viewer-react/`,
    `markdown-viewer-react/`, `video-viewer-react/`. Each contributes
    a `MimeRenderer` to the `files:mime-renderers` slot (declared by
    `files`). The `files` package exports a typed `pickMimeRenderer`
    selector that owns the glob-match-and-pick policy. No paired
    logic fragment because the only "logic" is inert MIME-pattern
    data on the contribution.

  See ADR 0002 §"Renderer-only fragments" for the rule. The
  principle: every React component the app ships from lives
  inside a renderer fragment; shared primitives are a renderer
  fragment too; per-MIME viewers are renderer-only because they
  have no logic-side business beyond data registration.
- **ViewKey** — string identifier for a React component
  contributed to the `core:views` slot. Logic fragments contribute
  viewKeys (data) into their own slots; renderer fragments
  contribute the components those viewKeys resolve to (via
  `slots.register(coreViewsSlot, viewKey, component)` where
  `coreViewsSlot = defineKeyedSlot<ViewComponent>("core:views")`
  is exported from `core-react/public/extension-points.ts`).
- **Boot context** — the untyped `Record<string, unknown>` passed
  once at boot to extract long-lived hosts (the `Workspace`,
  optionally a boot logger). Touched only in `init-<fragment>.ts`
  via `getWorkspace(ctx)` and similar string-keyed adapters.
- **Workspace** — adapter host (from
  `@statewalker/workspace`); the long-lived application root.
  Provides `requireAdapter(Class)` for runtime services.
- **Adapter** — workspace-scoped service registered by class
  identity. **Escape hatch — must be justified.** Reserved for:
  (a) substrate buses themselves (`Commands`, `Slots`),
  (b) singular reactive state cells (`WorkspaceShellAdapter`,
  `ActiveModel`, `AgentRuntimeAdapter`),
  (c) addressable mutable stores with lifecycle and stable
  per-id refs (`SpecStore` is the canonical example —
  runtime `patch(id)` semantics that slot's "dispose+reprovide"
  cannot preserve). When proposing a new adapter, justify which
  of (a)/(b)/(c) it falls under; otherwise reach for slot +
  selector or `defineKeyedSlot<T>`.
- **Command** *(was: Intent — renamed per ADR 0008; v2 surface per
  OpenSpec change `shared-commands-v2-builder-and-registry`)* — typed
  RPC declared via a builder chain
  `Command.required(key) | .async(key) | .silent(key) |
  .custom(key, policy)` then `.input(schema).output(schema)` (any
  Standard Schema validator) and optional `.label/.description/.icon`,
  terminated by `.build() → CommandDeclaration<P,R>`. The bus
  dispatches via `commands.call(decl, payload)`; listeners register
  via `commands.listen(decl, fn, { priority? })` (default priority 0;
  higher fires earlier). A listener claims by returning `true`,
  returning a `Promise<R>`, or calling `cmd.resolve` / `cmd.reject`
  directly; returning `void` is observe-only. Input is validated
  against `inputSchema` before any listener runs; every resolved
  value is validated against `outputSchema`. Failures are reported
  via a single `CommandError` class with discriminated `kind`:
  `"input-validation" | "no-handlers" | "not-claimed" |
  "listener-threw" | "output-validation"`. Listener-throw
  short-circuits dispatch. Policy enforces "no listener claimed"
  outcomes: `required` rejects loudly, `async` rejects on
  no-handlers / waits on observers-only, `silent` waits on both,
  `custom` per-field. The v1 decl-level `defaultFn` is retired —
  fallbacks register as regular listeners at negative priority.
  `Command<P,R>` (the dispatched-command shape) carries `key`,
  `payload`, `settled`, `resolve`, `reject`, `promise` — the v1
  `handled` boolean is internal. Renamed because (a) the role IS the
  GoF Command pattern and (b) "intent" collides with the LLM domain
  used inside the same monorepo (`indexer-search`, `claude-flow`).
- **CommandsRegistry** — reactive declaration registry that
  complements the bus. Static factories on the `CommandsRegistry`
  namespace: `create(...decls?) → MutableCommandsRegistry` (chainable
  variadic `.set / .remove`, atomic on collision), `compose(...sources)
  → CommandsRegistry` (read-only union; `get` is first-match-wins),
  `filter(source, predicate)`, `namespace(source, prefix)`. Every
  registry exposes `list / get / onUpdate`. Used as the catalog
  substrate for AI tool projection, UI menus / action bars, and
  external-protocol adapter mounts (MCP, OpenAPI, gRPC).
- **Slot** — typed extension point declared via `defineSlot<T>(key)
  → SlotDeclaration<T>`. Pub/sub. The universal extension
  mechanism — applies to both logic and renderer extension; *any*
  fragment may declare a slot whose contributions are typed for
  its purpose (logic values, React components, etc.). Slot key
  prefix matches the declaring fragment's id. Bus methods take the
  declaration: `slots.provide(decl, value)`, `slots.observe(decl, cb)`,
  `slots.getSnapshot(decl)`. The only constraint on contributions
  is ADR 0002: contributions containing React must come from
  renderer fragments.
- **KeyedSlot** — id-keyed slot variant declared via
  `defineKeyedSlot<T>(key) → KeyedSlotDeclaration<T>`, exercised
  through the same `Slots` bus: `slots.register(decl, id, value)`,
  `slots.get(decl, id)`, `slots.observe(decl, cb)`. Used when
  contributions are addressable by stable id and consumers want
  O(1) lookup, collision-throw on duplicate ids with different
  values, and `useSyncExternalStore`-compatible reactivity.
  Indexing and version state live on the bus per slot key (no
  per-instance class as in the pre-0008 shape). Replaces the
  deleted `IdentifiableRegistry` adapter primitive — former
  registries (`ViewRegistry`, `CatalogRegistry`,
  `InlineContentRegistry`) are now `defineKeyedSlot` declarations
  living in their owning fragment's `public/extension-points.ts`.
- **Spec** — flat `{ root, elements }` map describing UI
  declaratively (json-render).
- **SpecStore** — workspace adapter, addressable specs. Panel
  `params: { specId }` resolves through this store.
- **Catalog slot** — `json:catalogs` slot (declared by
  `json-render`) carries id-keyed json-render catalog singletons
  (`defineCatalog` + `defineRegistry` + components map).
  Consumers read via `slots.get(catalogsSlot, catalogId)` where
  `catalogsSlot = defineKeyedSlot<Catalog>("json:catalogs")`.
- **Catalog** — set of components + actions a json-render spec is
  allowed to use, with Zod-typed props.

## Workspace adapters

Class-keyed services living on the `Workspace`. Each is owned by
exactly one fragment; other fragments interact via the class
identity (imported from the owning fragment's `public/`).

| Adapter | Owning fragment | Purpose |
|---|---|---|
| `Commands` *(was: `Intents`)* | (substrate — `@statewalker/shared-commands`) | RPC bus. Renamed per ADR 0008. |
| `Slots` | (substrate — `@statewalker/shared-slots`) | Extension-point bus |
| `SpecStore` | `json-render` | Addressable json-render specs; runtime `create`/`patch`/`delete` with stable per-id refs. Last surviving id-keyed adapter — slot's append-only model can't preserve the stable refs `useSyncExternalStore` requires |
| `WorkspaceShellAdapter` | `workspace-bridge` | FS-Access shell state machine: `{ status: 'loading' \| 'unsupported' \| 'empty' \| 'needs-permission' \| 'ready', label?, reason? }` with `BaseClass.notify()`. Owns silent-restore from a stored `FileSystemDirectoryHandle`, drives `runChangeWorkspace` internally on `granted`, exposes `workspace:reconnect` / `workspace:disconnect` commands. Read by `workspace-bridge-react`'s picker and by `core-react`'s `AppRoot` to switch between picker and main shell. See ADR 0004. |
| `ActiveModel` | `agent-runtime` | Singular `{provider, modelId, sourceId}` pointer the agent uses; written by `providers` (and future `local-models`), read by `agent-runtime` to project into `AgentRuntimeAdapter`'s unified `RuntimeState` |
| `AgentRuntimeAdapter` | `agent-runtime` | Unified `RuntimeState` discriminated union (`loading` / `no-providers` / `no-active-model` / `error` / `ready { runtime, agent, … }`); single source of truth for "can the chat send a message?" |

Former adapters that collapsed to slots (see Slot ownership map):
`ViewRegistry` → `core:views`; `CatalogRegistry` → `json:catalogs`;
`InlineContentRegistry` → `inline-content:renderers`. Each is read
through a `defineKeyedSlot<T>` declaration on the same `Slots` bus.

Distinct from `ModelStateStore.setActiveModel` in
`@statewalker/ai-agent/models` — that one tracks which **local
models have been loaded into memory** (multi-valued, keyed by
local-model id).

**`ActiveModel` semantics (revised for session-level model
selection):** the model the chat agent uses is **per-session**,
not workspace-singular. Each `Session` carries its own
`modelRef: { connectionId, modelId }`. `ActiveModel` is retained
as a workspace-level **default suggestion** — it records the
*last-selected* model across all sessions, used to pre-fill the
dropdown for new sessions and as the recovery hint when a
session's stored model is no longer valid (its `modelId` no
longer appears in any Connection's `starredModelIds`). The
chat-composer dropdown for a session resolves like this:

1. If `session.modelRef` is set **and** the model is still
   starred in its Connection → the dropdown shows it as the
   current selection.
2. Otherwise (new session, or stored model invalidated by an
   un-star / Disconnect / Remove) → the dropdown opens awaiting
   selection, with `ActiveModel` highlighted as a suggestion
   (no implicit commitment — user must click to confirm).

`AgentRuntimeAdapter.ready` is gated on the *current session's*
`modelRef`, not on workspace `ActiveModel`. The adapter projects
"no model selected" into its `RuntimeState` for sessions in
state 2.

## Slot ownership map

Slot keys match the declaring fragment's id.

| Slot key | Declaring fragment | Carries |
|---|---|---|
| `agent:tools` | `agent-runtime` | `ToolFactory` |
| `agent:skills` | `agent-runtime` | `Skill` |
| `agent:mcp-connections` | `agent-runtime` | `McpConnection` |
| `providers:remote` | `providers` | `ProviderDescriptor` |
| `settings:tabs` | `settings` | `SettingsTab` |
| `files:mime-renderers` | `files` | `MimeRenderer` — `{ mimeTypePattern, order?, buildPanel(uri) }`; resolved via `pickMimeRenderer(slots, mime)` selector exported by `files` (glob-match → order sort → first wins) |
| `files:mime-icons` | `files` | `MimeIcon` |
| `files:editor-factories` | `files` | `EditorFactory` |
| `files:indexers` | `files` | `FileIndexer` |
| `chat:turn-blocks` | `chat` | `{ kind, render }` |
| `chat:composer-actions` | `chat` | `ComposerAction` |
| `inline-content:components` | `inline-content` | `InlineComponentContribution` — logic-side `{name, schema}` declarations |
| `inline-content:renderers` | `inline-content` (declared); `inline-content-react` (contributes) | `{ id: name, component: ReactComponent }`; replaces former `InlineContentRegistry` adapter |
| `core:views` | `core-react` | `{ id: viewKey, component: ReactComponent }`; replaces former `ViewRegistry` adapter. Renderer fragments contribute named components; logic fragments reference viewKeys from slot values (pattern C in ADR 0002) |
| `json:catalogs` | `json-render` | `{ id: catalogId, catalog: Catalog }`; replaces former `CatalogRegistry` adapter |
| `dock:side-panels` | `dock` | `{ id, side: 'left' \| 'right', order?, viewKey, defaultSize? }` — fixed side panels rendered alongside `DockViewHost` in `MainShell`. SessionsPanel from `chat-views` is the first contributor. |
| `dock:header-items` | `dock` | `{ id, slot: 'leading' \| 'trailing', order?, viewKey }` — items rendered in `MainShell`'s `ShellHeader`. Contributors today: workspace-bridge-views (workspace label + switch button), settings-views (settings button). |
| `dock:overlays` | `dock` | `{ id, viewKey }` — modal/dialog/overlay components mounted alongside `MainShell`. Settings dialog from `settings-views` is the first contributor. |

## Models and connections

Domain vocabulary for the model-management surface. The
`models-config` (+ `-react`) fragment owns the user-facing dialogs;
`ai-providers` remains sole storage owner (`providers.json`,
`Providers` adapter, `providers:remote` slot contributions).

- **Connection** — a configured endpoint to a remote model
  provider. Replaces the prior canonical / custom split. Stored
  shape: `{ id, type: 'openai'|'anthropic'|'google'|'openai-compatible'|…,
  name, url?, apiKey, headers?: { name; value }[], discoveredModels?,
  discoveredAt? }`. Multiple connections of the same canonical
  `type` are allowed (e.g. a work and a personal OpenAI key).
  Each Connection produces exactly one `ProviderDescriptor` in
  `providers:remote` with `descriptor.id === connection.id`.
  `ActiveModel.providerId` is a Connection id; the v3→v4
  migration assigns deterministic ids (`openai`, `anthropic`,
  `google`) for existing canonical entries so `active` survives
  unchanged.

  **`url` field rule (form validation):** required for
  `openai-compatible` (the endpoint *is* the configuration) **and**
  for `anthropic` (Anthropic's API disables CORS, so direct
  browser-to-API calls are impossible — a proxy URL is the only
  working configuration in a browser deployment). Optional for
  `openai` and `google` (used only when the user wants to point at
  a proxy). This refines ADR 0009 which originally treated all
  canonical types uniformly.
- **DiscoveredModel** — `{ id, label, capabilities? }` cached on a
  Connection. Populated by an HTTP fetch against the provider's
  models endpoint. Cached in `providers.json`; `discoveredAt`
  records the last successful fetch.

- **Connection lifecycle (UI verbs)**:
  - **Connect** — first-time fetch. User has entered `apiKey`
    (and `url` where required); pressing the button fires the
    provider's models endpoint and writes `discoveredModels` +
    `discoveredAt`. On success the default-starred set (see
    below) is applied. On failure the error is rendered in-card
    (e.g. "API key is not valid").
  - **Check Connection** *(also labelled "Update" in the spec)* — re-fetch
    against a Connection that already has `apiKey` and
    `discoveredModels`. Refreshes the cache, preserves the
    user's existing `starredModelIds` (no re-application of
    defaults).
  - **Disconnect** — clears `apiKey`, `discoveredModels`, and
    `starredModelIds` on the Connection. The shell record (id,
    type, name, url, headers) persists so the user can re-enter
    the key and Connect again without re-typing the rest. A
    disconnected Connection contributes no
    `ProviderDescriptor`. There is no separate "Remove" in this
    iteration — a disconnected shell is the dormant state.
  - **"Connected" predicate (derived)** — a Connection is
    "connected" iff `discoveredModels !== undefined` (which
    coincides with `apiKey !== ""`). The connection card's
    button set is driven by this predicate: disconnected →
    `[Connect]`; connected → `[Check Connection, Disconnect]`.
- **Capability** — a model's functional role tag. Not derived
  from the server response; resolved by a curated table in
  `models-config` keyed by model-id glob pattern. A model can
  carry several capability tags. Canonical tags for chat-mini:
  `chat` (chat-suitable, brain icon — the only tag the composer
  dropdown filters in), `embedding`, `image-gen`, `tts`. Models
  with no match default to `['chat']` so unknown remote models
  remain usable in chat. The Settings → Models & Connections
  tab renders each discovered model with its capability icons
  inline; an info banner at the top of the tab explains "to
  chat you need a chat-capable model (brain icon)". The
  composer's session dropdown is filtered by the predicate
  `starred && capabilities.includes('chat')`.
  *(The original `text` tag is retired — it was ambiguous
  between "produces text tokens" and "usable in chat". `chat`
  names the actual filter dimension.)*
- **Starred model** — a `DiscoveredModel` the user has checked
  inside its Connection's model list. Storage: per-Connection
  `Connection.starredModelIds: string[]`. **One concept, one
  flag** — the checkbox in Settings IS the star. The chat
  composer's session-level model dropdown is composed of every
  starred model across every Connection; selecting one sets it
  as the session's active model. The dropdown's last entry is
  always "Configure models…", which opens the Settings dialog
  on the Models & Connections tab. Top-level
  `ProvidersConfig.starred: StarredRef[]` from the v4 draft is
  retired in favour of the per-Connection field; existing
  entries fan out into each Connection's `starredModelIds` on
  v4→v5 migration. The "Models List" cross-connection dialog
  from the original draft is retired — per-tab model lists
  inside Settings replace it.
- **Default-starred set** — a curated, hardcoded list, **keyed
  by Connection `type`**, of model-id glob patterns that are
  pre-checked the first time a Connection of that type is
  successfully connected. Example: Google → `gemini-*`; OpenAI
  → `gpt-4*`. Lives in `models-config` as a static table. Only
  applied on the **first** successful `Connect` for a
  Connection (when `discoveredModels` flips from `undefined` to
  populated); subsequent reconnects ("Check Connection") do
  **not** re-apply defaults, so user un-checks are durable.
- **Local model** — `runtime: 'local'` catalog entry (engine `tjs`
  in the first cut; `webllm` / `llamacpp` remain disabled).
  Identified by a catalog key (e.g. `local:smollm2-360m`). Two
  lifecycle steps:
  1. **Download** — explicit, in the Local Models dialog. Weights
     flow through transformers.js + the FilesApi SW write-through
     to `<systemFolder>/models/tjs/<modelId>/`. The catalog entry
     is added to `ProvidersConfig.local.downloaded`.
  2. **Activation** — lazy, on the first chat message after
     selection. `ActiveModel.createProvider()` returns a
     `ProviderV3` whose `languageModel(modelId)` triggers
     `ModelManager.activate(key)` (loads ONNX weights into the
     worker). Subsequent turns reuse the in-memory model.
- **Local catalog merge** — `models-config` mounts a
  `ModelManager` per workspace, calls `registerBrowserProviders`
  (transformers.js engine), and feeds it
  `mergeCatalogs(createDefaultCatalog(), tjsExtensions)`. The
  default-catalog tjs entries that today live commented-out in
  `@statewalker/ai-agent/models` are re-enabled here.

Slot additions for this surface (revised — see ADR 0011):

| Slot key | Declaring fragment | Carries |
|---|---|---|
| `settings:tabs` (existing) | `settings` | Two new contributions from `models-config`: **Models & Connections** tab (4 type-sub-tabs: Google / OpenAI / Anthropic / OpenAI-compatible) and **Local Models** tab. The earlier `dock:overlays` contribution from the v4 draft is retired — the dialogs become Settings tabs per ADR 0011's reversal of ADR 0010. |

Adapter additions:

| Adapter | Owning fragment | Purpose |
|---|---|---|
| `LocalModels` | `models-config` | Wraps `ModelManager` + `LocalModelStorage` + the workspace's transformers.js factory. Exposes `download(key, onProgress)`, `cancelDownload(key)`, `removeWeights(key)`, `listDownloadable()`, and a `ModelStateStore`-derived `ProviderV3` used by `ActiveModel.createProvider()` for `kind: 'local'`. |

Storage shape additions to `ProvidersConfig` (v5 — supersedes
the unshipped v4 draft):

- `connections: Connection[]` — `{ id, type, name, url?,
  apiKey, headers?, discoveredModels?, discoveredAt?,
  starredModelIds: string[] }`. `starredModelIds` is per-Connection
  (the v4 top-level `starred: StarredRef[]` is retired).
- `local: { downloaded: LocalModelRef[]; lastActivatedKey?: string }`.

`Session` records gain `modelRef?: { connectionId, modelId }`
(persisted in the session's own storage, not in `providers.json`).

Migration v3→v5 (v4 was never shipped):
- Canonical `remote.{name}` entries become Connections with
  `id == name`.
- `custom[]` entries become Connections with their original
  ids.
- If a v4 fixture is encountered with top-level `starred`, fan
  it out into each Connection's `starredModelIds`.

Commands declared by `models-config`:

- `select-model { connectionId, modelId }` — sets the current
  session's `modelRef`. Listener writes to the active session's
  record and updates workspace `ActiveModel` (last-selected hint).
- `configure-models { typeHint?: ConnectionType }` — opens the
  Settings dialog on the Models & Connections tab. If
  `typeHint` is supplied (e.g. derived from the current
  session's model), the matching type-sub-tab is focused;
  otherwise the first sub-tab is shown. Fired by the composer
  dropdown's last entry. The `manage-remote-connections` and
  `manage-local-models` commands from the v4 draft are
  retired — Settings tabs make explicit per-dialog entry
  points unnecessary.

UI architecture: the Settings dialog (owned by `settings`)
hosts both new tabs. `models-config` publishes a json-render
spec per tab (no `dock:overlays` host). Each tab spec uses the
shared `models-config` catalog (shadcn + `Markdown` primitive). The spec is rendered against a `models-config`
**catalog** that extends the shadcn json-render catalog with one
custom primitive: `Markdown: { props: { source: string } }`,
bound on the renderer side to the existing markdown-viewer
pipeline. Used in the Models List / Local Models right-pane
description (capabilities chips above, rendered markdown below).
The state model is two-segment:

- `/persistent/*` — mirrored from `Providers.config` (and
  `LocalModels`) by a renderer-side subscription. Writes go back
  through commands that call `Providers._saveProviders` (or
  `LocalModels.download` etc.); the resulting `Providers` update
  re-flows into `/persistent/*` and closes the loop.
- `/ui/*` — purely in-memory: dialog open flags, search query,
  capability filter, in-progress connection form, current
  download phase.

Components retired with this change:
- `ai-providers-react/ProviderConfigPanel` (the `settings:tabs`
  `providers` entry — the Models List + Remote Connections
  dialogs replace it).
- `ai-providers-react/ComposerModelPicker` (the
  `chat:composer-actions` `providers:model-picker` entry — the
  starred chip-list + "All models…" entry replaces it).
- `OpenProviderConfigCommand` (subsumed by
  `manage-remote-connections`).

`ai-providers-react` is removed entirely.
