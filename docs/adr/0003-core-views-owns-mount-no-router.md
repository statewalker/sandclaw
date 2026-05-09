# ADR 0003 — `core-views` owns the React mount; no React Router

Date: 2026-05-09
Status: accepted

## Context

ADR 0002 promised that `core-views` would mount the React root and
render an `App` component that switches between
`<DirectoryPickerEmptyState>` and the dock host based on workspace
state. The shipped code took a different shape: `src/main.tsx` calls
`createRoot(...).render(<App/>)` directly, `src/app.tsx` wraps
everything in `BrowserRouter`, and `src/router.tsx` defines a
`/pick-workspace` vs `/` split through React Router. Gating runs
through a separate `WorkspaceProvider` React context, not through
a workspace adapter. This drift contradicts ADR 0002 and the
"all application is composed from fragments" principle, and means
the picker / shell live in `src/components/` and `src/screens/`
instead of inside fragments.

## Alternatives considered

1. **Keep React Router; move picker route into
   `workspace-bridge-views`.** Preserves URL semantics for deep
   linking (`/pick-workspace`). Picker route element is exported
   by the renderer fragment. Drawback: the routing surface is
   essentially a single switch on workspace state — Router buys
   nothing here today, and ADR 0002 already promised an in-App
   switch.
2. **Keep router; only collapse `WorkspaceProvider` into
   `workspace-bridge`.** Smallest move; preserves the
   inconsistency with ADR 0002.
3. **Drop React Router; `core-views` owns `createRoot` and the
   App switch (this ADR).** Matches ADR 0002 verbatim. The shell
   becomes a single component switching on
   `WorkspaceShellAdapter`; deep-link `?s=<sessionId>` survives
   as a small mount-time effect inside `chat-views` that fires
   `chat:open-session` once after the workspace becomes ready.

## Decision

Adopt **alternative 3**. After the architecture migration:

- `core-views/` owns `createRoot(document.getElementById('app')!).render(<AppRoot/>)`.
- `<AppRoot/>` wires `<AppWorkspaceProvider/>` (the
  `workspace-bridge-views` provider that exposes the boot-time
  `Workspace`) and `<QueryClientProvider/>`, then renders `<App/>`.
- `<App/>` reads `WorkspaceShellAdapter` via
  `useAdapterValue(WorkspaceShellAdapter, a => a.getState())`.
  When `status !== 'ready'` it renders
  `<DirectoryPickerEmptyState/>` (from `workspace-bridge-views`).
  When `status === 'ready'` it renders `<MainShell/>` (from
  `dock-views`).
- `<MainShell/>` composes `ShellHeader` (driven by
  `dock:header-items`), the resizable layout (left side panels
  from `dock:side-panels`, the `DockViewHost` on the right), and
  overlays from `dock:overlays`.
- `src/main.tsx` becomes a pure boot script: build `Workspace`,
  build the boot context, register all fragment `init` functions,
  attach the `beforeunload` cleanup. No JSX.
- `src/app.tsx` and `src/router.tsx` are deleted.
- Deep-link `?s=<id>` becomes a one-shot effect inside
  `chat-views`' init or a small hook mounted from `<MainShell/>`,
  not a route.

## Consequences

- **Single source of truth for "what's on screen"**: workspace
  state. No second source (the URL) to keep in sync.
- **Picker UI lives in `workspace-bridge-views`**, not in
  `src/components/`. Plug-in shells can replace the picker by
  contributing a different renderer fragment; today this is
  enforced by location.
- **No URL routing.** The app has only two top-level surfaces
  (picker / main shell); query params (`?s=`, future `?tab=`)
  are still meaningful, just not gated on. If a future surface
  warrants routing (e.g. multi-document deep links), introduce
  Router locally inside the relevant fragment — not at the
  app root.
- **`core-views`' public surface grows**: it now exports
  `useAdapterValue`, `useRegistry`, `IdentifiableRegistry` (the
  substrate hooks previously in `src/lib/`).

## Why this is hard to reverse

Any code that imports React Router primitives (`useSearchParams`,
`Navigate`, `Routes`) at the app root constrains every fragment's
URL assumptions; backing it out later means rewriting every
location-aware effect. Fixing the mount path now keeps the
constraint shape singular: workspace state in, view out.
