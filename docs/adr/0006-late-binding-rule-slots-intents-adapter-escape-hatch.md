# ADR 0006 — Late-binding rule: slots + intents + adapter as escape hatch; `IdentifiableRegistry` retires

Date: 2026-05-09
Status: accepted (substrate naming updated by ADR 0008)

> **Naming update (2026-05-10):** The `Intents` bus was renamed to
> `Commands` and the late-binding API was reshaped per ADR 0008. The
> decision rule below is unchanged — only the type/package names
> shifted (`@statewalker/shared-intents` → `@statewalker/shared-commands`,
> `Intents.run` / `addHandler` → `Commands.call` / `listen`, `newIntent`
> → `defineCommand`, `newSlot`/`KeyedSlot` → `defineSlot`/`defineKeyedSlot`).
> Read this ADR with that substitution in mind.

## Context

The fragment substrate has two parallel pub/sub mechanisms today:

- **Slots** (`@statewalker/shared-slots`) — typed extension points
  declared via `newSlot<T>(key) → [provide, observe]`. Many
  publishers, many subscribers, reference-deduped.
- **`IdentifiableRegistry<T>`-based adapters** —
  `ViewRegistry`, `CatalogRegistry`, `InlineContentRegistry`. All
  three subclass a shared 70-LOC `IdentifiableRegistry<T>`
  primitive that stores values in an id-keyed map, throws
  `RangeError` on duplicate ids with different values, exposes
  `register / get / observe / version`, and is consumed by React
  via `useRegistry(adapterCtor)` (a `useSyncExternalStore`
  binding).

Both mechanisms do the same job — accept contributions from many
fragments, expose them to many consumers — with different shapes
(append-only set vs. id-keyed map). The "when do I use which?"
question has no forcing function. Symptoms:

1. **A new registry-shaped adapter (`MimeRendererRegistry`) was
   proposed** during the fragmentization grilling, even though
   `files:mime-renderers` is already a slot consumed via a typed
   `pickRenderer(slots, mime)` selector. The grilling caught it,
   but the lack of a rule means the next one will be proposed
   too.
2. **`InlineContentRegistry` is already a "resolved" view of a
   slot** (`inline-content:components`) — the adapter holds a
   second mirror of contributions that the slot already carries,
   keyed differently.
3. **`shared-slots` was forced to ship React** (peer dep,
   devDep, `./react` sub-path export) to host `useSlot`, while
   `IdentifiableRegistry` carries `version` for
   `useSyncExternalStore` directly. Two ways to do
   "subscribe-and-rerender."

Three forces push toward unification:

1. **One late-binding mechanism is simpler than two.** Whatever
   "extension" means — registering a tool, contributing a settings
   tab, registering a React component for a viewKey, registering a
   MIME renderer — it should reach the same primitive.
2. **Adapters should mean something specific.** Today "adapter"
   means anything attached to the workspace by class identity.
   Some are genuinely stateful (`SpecStore` mutates entries with
   `patch(id)`); some are reactive cells (`WorkspaceShellAdapter`,
   `ActiveModel`, `AgentRuntimeAdapter`); some are id-keyed
   registries indistinguishable from slots. Squashing the last
   group into slots leaves "adapter" with a precise meaning.
3. **Substrate should be framework-agnostic.** `shared-slots`
   shipping React contradicts its role as substrate.

## Alternatives considered

1. **Status quo — keep both mechanisms.** Pros: no migration.
   Cons: inconsistency persists; new adapters keep being proposed;
   `shared-slots` stays React-coupled; the architecture has no
   forcing function for the "should this be an adapter or a slot?"
   question.
2. **Extend `Slots` with native id-keyed mode.** Add
   `provideKeyed(key, id, value)`, `getKeyed`, `observeKeyed` to
   the substrate API. Pros: one substrate API covers both shapes.
   Cons: every existing slot consumer's mental model shifts; the
   substrate API grows; same code in a different place.
3. **Wrap slots with a typed helper, keep substrate minimal (this
   ADR).** Introduce `KeyedSlot<T>` — a thin class that owns one
   slot key, accepts `{id, value}` records, maintains an indexed
   `Map<id, T>` snapshot, exposes `register / get / observe /
   version`, throws on id collision. `IdentifiableRegistry`-based
   adapters collapse to `KeyedSlot<T>` wrappers over per-key slot
   keys. The substrate API stays minimal; the wrapper is opt-in.
4. **Collapse everything to slots, including `SpecStore`.** Slots
   are append-only with reference-identity; SpecStore mutates
   records with `patch(id)`. Modelling `patch` as
   "dispose+reprovide" loses the stable-reference contract that
   `useSyncExternalStore` requires (per `SpecStore`'s own contract
   comment). Either fight the substrate or rebuild stable refs
   externally — both reinvent an adapter outside of substrate.
   Rejected.

## Decision

Adopt **alternative 3**: wrap slots with `KeyedSlot<T>` for
id-keyed cases; codify a strict three-row rule for adapters.

### The rule

Late binding between fragments uses **two primitives + one
escape hatch**:

- **Slot** — the universal pub/sub primitive. Applies to logic
  *and* renderer extension equally; a logic fragment may declare
  a slot whose contributions are React components, a renderer
  fragment may equally declare one. The only constraint is ADR
  0002: contributions containing React must come from renderer
  fragments. Selection policy lives in typed selector functions
  exported by the consuming fragment (e.g.,
  `pickMimeRenderer(slots, mime)`), not in the slot itself.

- **Intent** — typed RPC. First-claim-wins handler. Use when a
  fragment needs to *invoke* behaviour another fragment may
  handle.

- **Adapter** *(escape hatch — must be justified)* — workspace-
  scoped service registered by class identity. Reserved for:
  - **(a)** the substrate buses themselves (`Commands`, `Slots`),
  - **(b)** singular reactive state cells
    (`WorkspaceShellAdapter`, `ActiveModel`,
    `AgentRuntimeAdapter`),
  - **(c)** addressable mutable stores with lifecycle and stable
    per-id refs (`SpecStore` is the canonical example —
    runtime `patch(id)` semantics that slot's "dispose+reprovide"
    cannot preserve).

  When proposing a new adapter, justify which of (a)/(b)/(c) it
  falls under; otherwise reach for slot + selector or
  `KeyedSlot<T>`.

### `KeyedSlot<T>` — the wrapper

A framework-agnostic helper class living next to `Slots` in
`@statewalker/shared-slots`. Public API mirrors what
`IdentifiableRegistry<T>` exposed:

```ts
class KeyedSlot<T> {
  constructor(slots: Slots, slotKey: string);
  register(id: string, value: T): () => void; // collision-throws
  get(id: string): T | null;                  // O(1)
  observe(cb: (entries: ReadonlyMap<string, T>) => void): () => void;
  get version(): number;
}
```

Internally subscribes once to its slot key and maintains a
`Map<id, T>` index, invalidating on snapshot change. The slot is
opaquely typed `{id: string; value: T}`; the wrapper takes
ownership of the slot key — anyone reading the slot directly
bypasses the indexing and breaks convention.

### Migrations

The three `IdentifiableRegistry<T>`-based adapters collapse to
`KeyedSlot<T>` wrappers over new slot keys:

| Former adapter | New slot key | Owning fragment |
|---|---|---|
| `ViewRegistry` | `core:views` | `core-react` |
| `CatalogRegistry` | `json:catalogs` | `json-render` |
| `InlineContentRegistry` | `inline-content:renderers` | `inline-content` |

`IdentifiableRegistry<T>` deletes. `useRegistry(adapterCtor)`
deletes; consumers use `useKeyedSlot(slots, key)` instead.

The proposed `MimeRendererRegistry` adapter from the
fragmentization grilling **is not introduced** — `files:mime-renderers`
stays a slot consumed via the typed `pickMimeRenderer`
selector. This is an instance of "selector-shaped extension is
not a registry." See `notes/2026-05/2026-05-09/03.chat-mini-fragmentization-plan.md`
decision #11.

`SpecStore` stays an adapter; it is the canonical (c)-row case
under the rule above and is the last surviving id-keyed adapter
post-migration.

`inline-content` ends up declaring **two** slots —
`inline-content:components` (logic-side `{name, schema}`
declarations) and `inline-content:renderers` (renderer-side
React components, replacing the former adapter). They are looked
up by matching `name === id`.

## Consequences

- **One pub/sub mechanism.** Slots cover every "many-fragments-
  contribute, consumers-read" pattern. Adapters become a small,
  named set with a stated reason for each.
- **`shared-slots` becomes framework-free** (see ADR 0007). No
  React peer dep, no devDep, no `./react` sub-path export.
- **`core-react` grows** to host `useSlot` and `useKeyedSlot`.
- **`IdentifiableRegistry<T>` (~100 LOC) deletes**; `KeyedSlot<T>`
  (~80 LOC) replaces it. Net negative.
- **Convention enforcement is structural**: package boundaries
  prevent contributing to a slot whose key is exported only in
  the declaring fragment's `public/`; `useKeyedSlot` reads the
  same key constant.
- **A new adapter requires a justification line in its CONTEXT.md
  row** stating which of (a)/(b)/(c) it falls under. Forcing
  function for future "should this be an adapter?" decisions.

## Why this is hard to reverse

Reintroducing two parallel pub/sub mechanisms means re-creating
`IdentifiableRegistry<T>`, re-paying its surface area, and
splitting the rule "all extension points are slots" — at which
point new contributors are unsure which mechanism a given
extension point uses. The rule earns its strength from being
absolute. Once chat-mini and the workbench substrate are written
against it, fragments contributed by plug-in authors will follow
it by reading the existing code.

## Amendment 2026-05-10 — IdentifiableRegistry retirement landed

The retirement landed in OpenSpec change
`fragmentize-workbench-and-collapse-explorer` (task group 6). Snapshot
of the surface that replaces the three subclass adapters:

| Retired class | Slot key | Owning package | Logic helper | React hook |
|---|---|---|---|---|
| `ViewRegistry` | `core:views` | `@statewalker/core-react` | `newViewRegistry(workspace)` | `useViewRegistry()` |
| `CatalogRegistry` | `json:catalogs` | `@statewalker/json-render` | `newCatalogRegistry(workspace)` | `useCatalogRegistry()` |
| `InlineContentRegistry` | `inline-content:renderers` | `@statewalker/inline-content` (key) + `@statewalker/inline-content-react` (hook) | `newInlineContentRegistry(workspace)` | `useInlineContentRegistry()` |

Each helper / hook returns a `KeyedSlot<T>` over the named slot key.
The retired classes have been deleted from the codebase; only the
prose mentioning them in `CONTEXT.md` and ADR text remains.
