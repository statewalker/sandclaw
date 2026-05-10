# ADR 0007 — Renderer suffix renamed `-views` → `-react`; `shared-slots` becomes framework-free

Date: 2026-05-09
Status: accepted

## Context

ADR 0002 split fragments into logic (`<fragment>/`) and renderer
(`<fragment>-views/`). The `-views` suffix was inherited from
`workbench-views` — the legacy substrate's renderer package —
where it predates ADR 0002 and meant "view models" (framework-
agnostic UI state, *not* React itself).

Two issues with `-views` post-ADR-0002:

1. **The suffix lies about framework.** Under ADR 0002, the
   renderer fragment imports React, not framework-agnostic view
   models. Calling it `-views` invites confusion every time a new
   contributor opens a renderer fragment expecting view-model
   classes and finds JSX. The `workbench-views` legacy package
   was renamed to `workbench-react` for exactly this reason; the
   in-app fragment naming never followed.
2. **It blocks future framework alternatives.** If any future
   fragment ships a Vue or Solid companion (e.g., a non-React
   embed of the dock), the `-views` suffix forces it to compete
   for the same slot. Explicit framework suffixes (`-react`,
   `-vue`, `-solid`) make multi-framework substrates expressible
   without ambiguity.

A separate but tightly-related issue: `@statewalker/shared-slots`
ships React. Today its `package.json` declares:
- `peerDependencies.react: ">=18"` (optional),
- React + React DOM + Testing Library in `devDependencies`,
- `./react` sub-path export pointing at `src/react.ts`, which
  contains a single `useSlot` hook (37 LOC).

`shared-slots`' role is "typed pub/sub bus for cross-fragment
extension points." Nothing in that role is React-specific. The
React hook leaks framework dependence into a substrate package
that should be framework-agnostic. ADR 0006's `KeyedSlot<T>`
wrapper compounds the issue — its React companion (`useKeyedSlot`)
needs a home, and putting it next to `useSlot` would entrench
React-coupling further.

Two consumers of `useSlot` exist today
(`chat-views/internal/composer.tsx` and
`dock-views/internal/main-shell.tsx`). The migration cost is
trivial.

## Alternatives considered

1. **Keep `-views` and `shared-slots/react`.** Pros: zero
   migration. Cons: the suffix lies, the substrate isn't
   framework-free, future framework companions have no idiom.
2. **Rename `-views` → `-react`; spin up `shared-slots-react`.**
   Pros: parallel-companion pattern (`shared-slots` +
   `shared-slots-react`) generalizes if `shared-intents` or
   `workspace-api` ever grow framework hooks. Cons: another
   substrate-level package for ~2 hooks; `core-react` (which
   every renderer depends on anyway) already houses framework
   substrate hooks.
3. **Rename `-views` → `-react`; move React hooks into
   `core-react` (this ADR).** Pros: framework substrate
   concentrated in one place; renderers already depend on
   `core-react`; `shared-slots` becomes truly framework-free with
   no peer dep, no devDep, no sub-path. Cons: `core-react`
   accumulates the React substrate role, but it already has it
   (React mount, `AppRoot`, `core:views` slot per ADR 0006).

## Decision

Adopt **alternative 3**.

### Renderer fragment naming

`<fragment>-views/` → `<fragment>-react/`. Under the workbench-
canonical inversion (ADR 0005), every renderer fragment becomes
a published `@statewalker/<fragment>-react` (or
`@repo/<fragment>-react`) package. The `-react` suffix mirrors
the `workbench-react*` precedent and reserves the `-vue` /
`-solid` namespace for future framework substrates.

The companion-pair shape from ADR 0002 is unchanged — every
React-containing fragment still pairs (logic) `<fragment>/` +
(renderer) `<fragment>-react/`, and renderer-only fragments
still exist for pure React-substrate concerns (per ADR 0002
§"Renderer-only fragments").

### `shared-slots` becomes framework-free

`@statewalker/shared-slots/package.json` drops:
- `peerDependencies.react`,
- `peerDependenciesMeta.react`,
- `react`, `react-dom`, `@types/react`,
  `@testing-library/react`, `happy-dom` from `devDependencies`,
- the `./react` sub-path export.

`@statewalker/shared-slots/src/react.ts` deletes.

`KeyedSlot<T>` (introduced by ADR 0006) is framework-agnostic and
lives in `@statewalker/shared-slots` alongside `Slots` and
`newSlot`.

### React hooks consolidate in `core-react`

`core-react` (the renamed `core-views`, per ADR 0005) hosts:
- `useSlot(slots, observe)` — moved from `shared-slots/react`,
- `useKeyedSlot(slots, slotKey)` — new, replaces the deleted
  `useRegistry(adapterCtor)`,
- `useAdapterValue` — already there,
- `useAdapter` — relocated or re-exported (cross-fragment;
  workspace-bridge-react owns the workspace context provider).

The two existing call sites of
`@statewalker/shared-slots/react` retarget to
`@statewalker/core-react`.

## Consequences

- **`shared-slots` is honestly substrate** — no framework, no
  framework devDeps. Future framework adapters (`core-vue`,
  `core-solid`) build their own `useSlot` analog locally.
- **`core-react` is the sole React-substrate home** — owns the
  React mount, `AppRoot`, `core:views` slot key, theme binding,
  and all framework hooks (`useSlot`, `useKeyedSlot`,
  `useAdapterValue`, `useAdapter`).
- **Naming is honest** — `<fragment>-react/` says "this fragment
  imports React"; readers don't confuse it with framework-
  agnostic view models.
- **One-time mechanical migration** — every renderer fragment
  folder renames; every `import` from `@/fragments/<name>-views`
  retargets to `@statewalker/<name>-react` (the rename combines
  with the package extraction in ADR 0005's migration). Two
  `useSlot` import lines retarget.
- **Multi-framework future stays open** — `-vue` / `-solid` are
  reserved namespaces, and the `core-*` substrate-fragment
  pattern generalizes to per-framework substrates.

## Why this is hard to reverse

Reintroducing React into `shared-slots` means re-acquiring the
peer dep + devDeps + sub-path, which violates the "substrate is
framework-agnostic" property the umbrella's other substrate
packages (`shared-intents`, `workspace-api`, `webrun-files`) all
honor. Renaming `-react/` back to `-views/` would once again
hide the framework, immediately confusing the next contributor.
The migration is small enough that the temptation to revert is
low; the rename is large enough that re-acquiring it would be
an obvious regression.

## Amendment 2026-05-10 — `./styles` discovery requires app-side enumeration

The `-react` rename and the `shared-slots` framework-free property both
landed cleanly. The `./styles` Tailwind contract needed an
implementation-time augmentation: per-package `@source "./**/*.tsx"`
directives placed inside each `-react`'s `styles.css` are kept for
in-tree clarity but Tailwind v4 does not actually scan their globbed
paths because they resolve under `node_modules` (which Tailwind treats
as gitignore-excluded). Class discovery is delegated to workspace-
relative `@source` globs in the host app's `index.css`, anchored at
the umbrella root. See the corresponding amendment in ADR 0005 for the
full rationale.

Two additional notes:
- `@source "./**/*.{ts,tsx}"` brace expansion is rejected by Tailwind
  v4's CSS parser (`CssSyntaxError: Invalid declaration: ts,tsx`).
  Each `@source` is split into two directives — one `*.tsx` and one
  `*.ts`.
- `useSlot` ended up in `@statewalker/core-react` per the original
  decision, alongside `useKeyedSlot` (the new hook for
  `KeyedSlot<T>`). The legacy hook re-export from
  `@statewalker/shared-slots/react` is gone; consumers retargeted as
  part of the migration.
