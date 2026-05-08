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
  init function plus optional `intents.ts` and
  `extension-points.ts`. Touches the boot context only inside
  `init`; everything below works with typed values.
  Per ADR 0002, fragments come in two flavors: **logic** and
  **renderer**.
- **Logic fragment** — name `<fragment>/`. Imports zero React.
  Owns intents, slot declarations, adapter classes, json-render
  catalog declarations, JSON specs, state managers. Tests run
  in Node, no DOM.
- **Renderer fragment** — name `<fragment>-views/`. Imports React.
  Paired with a logic fragment; binds React components to its
  catalog component names; registers named components into
  `ViewRegistry` so logic fragments can reference them by
  viewKey from slot values.
- **Core renderer fragment** — `core-views/`. Activates
  `@json-render/shadcn`'s prebuilt bindings, registers the
  `ViewRegistry` adapter, mounts the React root.
- **ViewKey** — string identifier for a registered React
  component in `ViewRegistry`. Logic fragments contribute
  viewKeys (data) into slots; renderer fragments register the
  components those viewKeys resolve to.
- **Boot context** — the untyped `Record<string, unknown>` passed
  once at boot to extract long-lived hosts (the `Workspace`,
  optionally a boot logger). Touched only in `init-<fragment>.ts`
  via `getWorkspace(ctx)` and similar string-keyed adapters.
- **Workspace** — adapter host (from
  `@statewalker/workspace-api`); the long-lived application root.
  Provides `requireAdapter(Class)` for runtime services.
- **Adapter** — workspace-scoped service registered by class
  identity. Examples: `Intents`, `Slots`, `SpecStore`,
  `CatalogRegistry`.
- **Intent** — typed RPC declared via `newIntent<P,R>(key) →
  [run, handle]`. First-claim-wins. Bidirectional dependency:
  any fragment may declare, run, or handle.
- **Slot** — typed extension point declared via `newSlot<T>(key)
  → [provide, observe]`. Pub/sub. Lives with its consumer;
  unidirectional dependency (providers depend on slot, not vice
  versa). Slot key prefix matches the declaring fragment's id.
- **Spec** — flat `{ root, elements }` map describing UI
  declaratively (json-render).
- **SpecStore** — workspace adapter, addressable specs. Panel
  `params: { specId }` resolves through this store.
- **CatalogRegistry** — workspace adapter, id-keyed catalog
  singletons (json-render `defineCatalog` + `defineRegistry` +
  components map).
- **Catalog** — set of components + actions a json-render spec is
  allowed to use, with Zod-typed props.

## Workspace adapters

Class-keyed services living on the `Workspace`. Each is owned by
exactly one fragment; other fragments interact via the class
identity (imported from the owning fragment's `public/`).

| Adapter | Owning fragment | Purpose |
|---|---|---|
| `Intents` | (substrate — `@statewalker/shared-intents`) | RPC bus |
| `Slots` | (substrate — `@statewalker/shared-slots`) | Extension-point bus |
| `SpecStore` | `spec-store` | Addressable json-render specs |
| `CatalogRegistry` | `catalog-registry` | Id-keyed catalog singletons |
| `ActiveModel` | `agent-runtime` | Singular `{provider, modelId, sourceId}` pointer the agent uses; written by `providers` (and future `local-models`), read by `agent-runtime` to project into `AgentRuntimeAdapter`'s unified `RuntimeState` |
| `AgentRuntimeAdapter` | `agent-runtime` | Unified `RuntimeState` discriminated union (`loading` / `no-providers` / `no-active-model` / `error` / `ready { runtime, agent, … }`); single source of truth for "can the chat send a message?" |
| `InlineContentRegistry` | `inline-content` (logic) + `inline-content-views` (renderers) | Resolved json-render registry built from contributions to `inline-content:components` (logic side declares `{name, schema}`; renderer side registers React for `name`); read by any surface (chat, future report viewer, etc.) that renders AI-emitted inline UI |
| `ViewRegistry` | `core-views` | String-keyed React component registry; renderer fragments contribute named components; logic fragments reference viewKeys from slot values (pattern C in ADR 0002) |

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
| `files:mime-renderers` | `files` | `MimeRenderer` |
| `files:mime-icons` | `files` | `MimeIcon` |
| `files:editor-factories` | `files` | `EditorFactory` |
| `files:indexers` | `files` | `FileIndexer` |
| `chat:turn-blocks` | `chat` | `{ kind, render }` |
| `chat:composer-actions` | `chat` | `ComposerAction` |
| `inline-content:components` | `inline-content` | `InlineComponentContribution` |
