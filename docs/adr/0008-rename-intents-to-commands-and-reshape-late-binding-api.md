# ADR 0008 — Rename `Intents` → `Commands`; reshape the late-binding API around declarations + bus methods

Date: 2026-05-10
Status: accepted

## Context

ADR 0006 stabilised the late-binding rule (slots + intents + escape-hatch
adapter). The substrate APIs that implement that rule were not revised
at the same time and remain shaped as they were when the patterns were
first extracted:

- `@statewalker/shared-intents` exposes `newIntent<P,R>(key) → [run, handle]`
  — a tuple of two opaque functions per intent, with a separate `KEY`
  string constant typically exported next to it. Handlers register via
  `intents.addHandler(key, fn)` and claim the intent by returning the
  literal `true`. Multiple handlers per key are merged into a `Set`;
  first claimer wins.
- `@statewalker/shared-slots` exposes `newSlot<T>(key) → [provide, observe]`
  — same tuple shape. `KeyedSlot<T>` (added by ADR 0006) is a class that
  has to be instantiated per-(slots,key) pair, with the type repeated
  at construction, at the React hook, and at the consuming fragment's
  factory helper (`newViewRegistry`, `newCatalogRegistry`,
  `newInlineContentRegistry`).

Two classes of friction emerge across the 124+ command call sites and
the ~20 keyed-slot registration sites in the umbrella:

1. **Boilerplate-per-extension-point.** Every keyed slot ships a `KEY`
   string constant, a typed `newXxxRegistry(workspace)` factory, a
   `useXxxRegistry()` React hook, and a type alias. The four exports
   are mechanically derivable from one input (`(key, T)`). They drift
   independently — typos in the string key fail at runtime; missed
   re-exports fail at consumer compile.
2. **API papercuts at call sites.** Tuple destructure with two opaque
   names (`[runPickFile, handlePickFile]`) is positional and
   memory-loaded; `await runPickFile(intents, p).promise` is two-step
   for the common case; handler `return true` to claim is a silent
   foot-gun (forgetting it = silent miss).

A separate, sharper concern is **terminology collision with the LLM
domain**. `intent` is heavily overloaded inside this same monorepo:
`statewalker-indexer/packages/indexer-search/src/intent.ts` is an LLM
intent classifier; `externals/claude-flow/.../intent-router.ts` is an
LLM intent routing component; the `ai-providers` package has its own
intents file under `src/public/intents.ts`. The substrate concept and
the LLM concept coexist in the same codebase, and the LLM side is
growing (the dockview-jsonrender-intents-vision note at
`notes/2026-05/2026-05-06/03.md` lays out a local-AI-agent workbench
where commands and LLM intents must be discussed in the same paragraph).

The substrate role is, precisely, the Command pattern: a request encoded
as an object with a payload, dispatched by name, optionally fulfilled by
a registered receiver. Visual Studio Code, Theia, and Lumino — the
adjacent vocabularies for editor-extension authors — all use
**commands**. Renaming aligns with industry expectation, removes the
LLM-namespace overlap, and incidentally decouples the substrate from
the (Android-inspired) origin name that few readers reach for first.

## Alternatives considered

1. **Keep both APIs and the `Intents` name; only fix the boilerplate.**
   Pros: smallest diff. Cons: leaves the LLM-namespace collision; the
   boilerplate is half of the pain — incremental fixes here will not
   yield a coherent surface. Rejected: the rename is cheap to bundle
   with a structural reshape and expensive to land alone later.
2. **Rename to `Commands` but keep the `[run, handle]` tuple shape.**
   Pros: minimal blast radius; just a noun change. Cons: leaves the
   per-intent boilerplate intact; the new name picks up the same DX
   problems in commands' clothing. Rejected.
3. **Reshape to `define* + bus.method(decl, …)`, but skip the rename.**
   Pros: solves DX; avoids doc churn. Cons: the LLM-intent collision
   keeps growing; once we touch every site for the reshape the
   marginal cost of also renaming is small. Rejected.
4. **Adopt VS Code-aligned `commands.execute` / `commands.handle`
   verbs verbatim.** Pros: maximal familiarity for editor-extension
   readers. Cons: our lifecycle is richer than VS Code's
   fire-and-forget (`Command` carries `pending → handled → settled`,
   supports late resolve, supports a per-decl default fallback). The
   VS Code-shaped verbs would mislead readers about the lifecycle
   they pick up. Rejected in favour of neutral `call` / `listen`.
5. **Rename to `Commands` and reshape both substrates around declaration
   carriers + bus methods (this ADR).** Pros: single coherent
   vocabulary; one declaration replaces the four-export-per-extension
   bundle; aligns the substrate with industry convention; surfaces the
   LLM-namespace separation. Cons: 124+ site big-bang; doc churn.
   Accepted.

## Decision

Adopt alternative 5. The substrate offers two declaration constructors,
two bus classes, and one lifecycle.

### Commands (was: Intents)

```ts
// @statewalker/shared-commands

interface Command<P, R> {
  readonly key: string;
  readonly payload: P;
  readonly handled: boolean;   // any listener claimed (not yet settled)
  readonly settled: boolean;   // resolve or reject was called
  resolve(result: R): void;
  reject(error: unknown): void;
  readonly promise: Promise<R>;
}

interface CommandDeclaration<P, R> { readonly key: string }

function defineCommand<P, R>(
  key: string,
  defaultFn?: (cmd: Command<P, R>) => R | Promise<R> | void,
): CommandDeclaration<P, R>;

class Commands {
  call<P, R>(decl: CommandDeclaration<P, R>, payload: P): Command<P, R>;
  listen<P, R>(
    decl: CommandDeclaration<P, R>,
    fn: (cmd: Command<P, R>) => true | Promise<R> | void,
  ): () => void;
}
```

**Dispatch lifecycle for one `commands.call`:**

1. The bus constructs a `Command<P, R>` with a fresh promise.
2. Every listener registered for the decl's key is invoked
   *synchronously*, in registration order, with `(cmd)`.
3. A listener **claims** by returning `true`, returning a `Promise<R>`,
   or calling `cmd.resolve` / `cmd.reject` directly. Returning
   `undefined` / `void` is observe-only. Multiple listeners may claim
   independently; the first call to `cmd.resolve` or `cmd.reject`
   settles the promise (subsequent calls no-op via the settled-guard).
4. All listeners are notified regardless of who claimed. Late
   listeners may inspect `cmd.handled` / `cmd.settled` and act
   accordingly (cleanup, log, etc.).
5. After the listener pass, **if no listener claimed**, the
   per-decl `defaultFn` is invoked with `(cmd)`. The default may
   resolve, reject, return a value (the bus uses it to resolve), or
   throw (the bus uses the error to reject).
6. **If `defineCommand(key)` was called without a `defaultFn` and no
   listener claimed**, the bus rejects synchronously with
   `Unhandled command: <key>`. Loud-fail by design — silent hangs are
   strictly opt-in via `defineCommand(key, () => {})`.

The single role (listener) replaces today's separate `handler` and
`listener` concepts. The default lives at the type-declaration level,
not at the runtime registration level — there is no
`commands.handle()`. This is intentional: anyone who would have
registered a handler now registers a listener and claims; anyone who
would have observed registers a listener and returns void.

### Slots (rename retained)

```ts
// @statewalker/shared-slots

interface SlotDeclaration<T>      { readonly key: string }
interface KeyedSlotDeclaration<T> { readonly key: string }

function defineSlot<T>(key: string): SlotDeclaration<T>;
function defineKeyedSlot<T>(key: string): KeyedSlotDeclaration<T>;

class Slots {
  // plain
  provide<T>(decl: SlotDeclaration<T>, value: T): () => void;
  observe<T>(decl: SlotDeclaration<T>, cb: (values: readonly T[]) => void): () => void;
  getSnapshot<T>(decl: SlotDeclaration<T>): readonly T[];

  // keyed
  register<T>(decl: KeyedSlotDeclaration<T>, id: string, value: T): () => void;
  get<T>(decl: KeyedSlotDeclaration<T>, id: string): T | null;
  observe<T>(
    decl: KeyedSlotDeclaration<T>,
    cb: (entries: ReadonlyMap<string, T>) => void,
  ): () => void;
}
```

`KeyedSlot<T>` as a class disappears: its index/version state moves
onto `Slots` itself, keyed by slot key. One cache, one version
counter, one observe surface.

### What goes away

- `newIntent<P,R>(key)` and the `[run, handle]` tuple.
- `Intents.addHandler` (and the matching boolean-claim handler shape).
- `newSlot<T>(key)` and the `[provide, observe]` tuple.
- `KeyedSlot<T>` class and its per-instance state.
- The `SLOT_KEY` symbol / `getSlotKey` helper (decl carries the key
  directly, hooks read it from there).
- Per-extension-point boilerplate: `*_KEY` string constants, the
  `newViewRegistry` / `newCatalogRegistry` / `newInlineContentRegistry`
  factories, and the `useXxxRegistry()` hooks. Replaced by one
  `defineKeyedSlot<T>(key)` per extension point + `useKeyedSlot(slots, decl)`
  generic hook.

### What stays

- `Commands` and `Slots` registered as workspace adapters; consumers
  reach them via `workspace.requireAdapter(Commands)` /
  `workspace.requireAdapter(Slots)`.
- The three-state lifecycle on `Command` (`pending → handled → settled`)
  and the settled-guard.
- Collision-throw on keyed `register` with a different value under
  the same id; ref-counted no-op on same-reference re-register.
- React hooks `useSlot` / `useKeyedSlot` (signatures change to take a
  declaration: `useSlot(slots, decl)`).
- Workspace-scoping invariant: one workspace = one bus.

### Migration

Big-bang single PR + umbrella cascade. No deprecated re-exports, no
side-by-side dual-API window. The compiler drives the sweep across the
nine workspaces; any missed call site fails to build. This trades
landing-day risk for not maintaining two surfaces during the migration.
The ADR-6 substrate is recent enough (2026-05-09) that we still know
every site; that knowledge atrophies fast.

## Consequences

- **Single late-binding vocabulary across the substrate**: every
  extension point — command, slot, keyed slot — is declared with
  `define*(key)` and exercised through a bus method that takes the
  declaration. The four-export-per-extension-point bundle collapses
  to one declaration.
- **Industry-aligned terminology**: `Commands` slots into the same
  conceptual chair occupied by VS Code / Theia / Lumino. Plug-in
  authors familiar with editor extensions onboard faster. The LLM-
  intent namespace stops colliding with the substrate.
- **Loud-fail by default**: missing handlers (typos, bad import order,
  forgotten registrations) fail with a clear `Unhandled command: <key>`
  at first call rather than hanging silently. Silent-pending is opt-in.
- **The new `Slots` bus owns keyed-slot indexing centrally**, removing
  the per-`KeyedSlot`-instance cache duplication and the per-instance
  version counter that today's hooks rely on for `useSyncExternalStore`.
- **ADR 0006's late-binding rule remains valid** but its three-row
  adapter escape-hatch list now reads `(a) Commands, Slots — substrate
  buses` instead of `(a) Intents, Slots — substrate buses`.
- **The architecture/docs/ rewrite is non-trivial**: 359-line
  `intents.md` becomes `commands.md`; sections of `slots.md` describing
  the old `KeyedSlot` class shape get replaced. Same-cascade rewrite
  keeps the docs honest.

## Why this is hard to reverse

Once the rename and reshape land:

- 124+ command call sites have moved to `commands.call(decl, payload)`.
  Reverting reintroduces the tuple destructure and the boolean-claim
  foot-gun across all of them.
- Per-extension-point factories (`newViewRegistry` etc.) have been
  deleted; reverting requires reauthoring them with their type aliases
  and hooks.
- Public package names changed (`@statewalker/shared-intents` →
  `@statewalker/shared-commands`); package-name reversal is a second
  breaking change visible to any consumer outside the umbrella.
- The architectural docs describe the new vocabulary; reverting means
  rewriting the docs back, including ADR 0006's amendment table.

This is exactly the cost the rename is designed to *not* pay twice —
the LLM-namespace pressure and the boilerplate pressure both compound
month-over-month, and bundling the rename with the reshape costs once
what would otherwise cost twice.

## Cross-references

- ADR 0006 — late-binding rule (slots + intents + adapter escape hatch).
  Amended below.
- ADR 0007 — `shared-slots` is framework-free. Reshape preserves this;
  React hooks remain in `core-react`.
- `architecture/docs/commands.md` — replaces `intents.md` post-cascade.
- `architecture/docs/slots.md` — surface block updated to the new shape.
- `openspec/changes/commands-and-late-binding-api-reshape/` — the
  implementation proposal that lands this decision.

### Amendment to ADR 0006

The escape-hatch enumeration `(a) substrate buses themselves
(Intents, Slots)` reads, post-cascade, as `(a) substrate buses
themselves (Commands, Slots)`. The "two primitives + one escape
hatch" rule is otherwise unchanged: slot for many-to-many late
binding, command (was: intent) for typed RPC, adapter for the three
named cases.
