# ADR 0004 — FS-Access shell state lives in `workspace-bridge`, not in the substrate

Date: 2026-05-09
Status: accepted

## Context

Once the React-side `WorkspaceProvider` collapses (see ADR 0001
amendment + ADR 0003), the FS-Access shell state machine
(`loading` / `unsupported` / `empty` / `needs-permission` / `ready`,
plus the directory `label` and an optional unsupported `reason`)
needs a new home as a workspace adapter. The picker UI binds to
it; `core-views`' `<App/>` switches on it. Three plausible
locations:

1. **Extra fields directly on `Workspace` itself** (in
   `@statewalker/workspace-api`).
2. **Separate adapter inside `@statewalker/workspace-api`**.
3. **Separate adapter inside `@statewalker/platform-browser`**.
4. **Separate adapter inside chat-mini's `workspace-bridge`
   fragment** (this ADR).

`Workspace` already has `isOpened` (boolean), `label` (string),
`files`, and `BaseClass.notify()` reactivity. The four extra
states are all *pre-`open()`* states and all FS-Access-specific
(other deployments — node, electron, OPFS, headless tests — never
exhibit them).

## Alternatives considered

1. **On `Workspace` directly.** Pros: single observable, no
   adapter plumbing. Cons: pollutes the platform-agnostic
   substrate with FS-Access-specific concepts (`unsupported`,
   `needs-permission`); other deployments end up with dead
   states; conflates "is a folder bound + open?" with "can the
   user pick a folder, and have we tried silent restore?".
2. **Adapter shipped from `@statewalker/workspace-api`.**
   Same layering smell — workspace-api would need to know what
   FS-Access is.
3. **Adapter in `@statewalker/platform-browser`.** That package
   already owns the FS-Access-specific `platform:pick-directory`
   handler, so the layer is right. Adapter would be reusable
   across any future browser shell. Cost: substrate surface
   added today for one consumer (YAGNI).
4. **Adapter in `workspace-bridge`** (this ADR). Local to the
   only consumer today. Promote to platform-browser later when
   a second browser shell appears.

## Decision

Adopt **alternative 4**.

`workspace-bridge` exposes `WorkspaceShellAdapter` as a workspace
adapter:

```ts
export class WorkspaceShellAdapter extends BaseClass {
  getState(): WorkspaceShellState;
}

export type WorkspaceShellState =
  | { status: "loading" }
  | { status: "unsupported"; reason: string }
  | { status: "empty" }
  | { status: "needs-permission"; label: string }
  | { status: "ready"; label: string };
```

Plus two new intents alongside the existing
`workspace:change` (which already covers pick + non-interactive
rebind):

- `workspace:reconnect` — re-request permission on the stored
  handle, then `runChangeWorkspace` if granted; `workspace:disconnect`
  if denied.
- `workspace:disconnect` — `workspace.close()` + clear the
  stored handle + transition to `empty`.

`workspace-bridge`'s manager runs silent-restore on construction
(read stored handle → query permission → if `granted`, fire
`runChangeWorkspace` internally; otherwise publish
`needs-permission` or `empty`).

When (if) a second browser-based shell appears, the adapter
moves verbatim into `@statewalker/platform-browser`.

## Consequences

- **The substrate stays minimal.** `Workspace.isOpened` remains
  the only "is the workspace live?" boolean. FS-Access concepts
  do not leak upward.
- **Cross-deployment reuse is clean.** A non-browser shell
  (node, electron) builds its own state adapter with the states
  *it* exhibits.
- **One package, one concern.** `workspace-bridge` owns the
  FS-Access lifecycle end-to-end: handle storage, permission
  flow, state machine, intents. The picker UI subscribes to the
  one adapter.
- **Promotion path is explicit.** When platform-browser becomes
  the right home, the move is mechanical (re-export + change of
  import path).

## Why this is hard to reverse

Once consumers — `core-views`' `<App/>`, the picker UI, future
plug-in shells — bind to `WorkspaceShellAdapter` from
`workspace-bridge`'s public surface, moving the adapter means
changing every import. Choosing `workspace-bridge` first (with a
documented promotion path) keeps the move local to the import
graph; choosing platform-browser first commits us to a substrate
surface for one consumer.
