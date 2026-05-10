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
  (a) substrate buses themselves (`Intents`, `Slots`),
  (b) singular reactive state cells (`WorkspaceShellAdapter`,
  `ActiveModel`, `AgentRuntimeAdapter`),
  (c) addressable mutable stores with lifecycle and stable
  per-id refs (`SpecStore` is the canonical example —
  runtime `patch(id)` semantics that slot's "dispose+reprovide"
  cannot preserve). When proposing a new adapter, justify which
  of (a)/(b)/(c) it falls under; otherwise reach for slot +
  selector or `defineKeyedSlot<T>`.
- **Command** *(was: Intent — renamed per ADR 0008)* — typed RPC
  declared via `defineCommand<P,R>(key, defaultFn?) →
  CommandDeclaration<P,R>`. The bus dispatches via
  `commands.call(decl, payload)`; listeners register via
  `commands.listen(decl, fn)`. Single role (listener); a listener
  claims by returning `true`, returning a `Promise<R>`, or calling
  `cmd.resolve` / `cmd.reject` directly; returning `void` is
  observe-only. All listeners are notified regardless of who
  claimed. After the listener pass, if no listener claimed, the
  per-decl `defaultFn` runs as fallback; without one, the bus
  rejects with `Unhandled command: <key>` (loud-fail by design;
  silent-pending is opt-in via `defineCommand(key, () => {})`).
  Three-state lifecycle preserved on `Command<P,R>`: `pending →
  handled → settled`. Renamed because (a) the role IS the GoF
  Command pattern and (b) "intent" collides with the LLM domain
  used inside the same monorepo (`indexer-search`, `claude-flow`).
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
local-model id). `ActiveModel` is a singular workspace pointer to
the **currently-selected** provider/model.

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
