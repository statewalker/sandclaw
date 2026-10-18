# @statewalker/workspace.view.react

## What it is

A view fragment that adds two workspace controls to the shell: a header label
showing the open folder (`SandClaw / <folder>`), and a "Switch workspace"
button. Both read `WorkspaceShellAdapter` from `@statewalker/workspace.browser`
and act only by calling its commands.

## Why it exists

The workspace state machine and the File System Access / IndexedDB logic live
in `@statewalker/workspace.browser`, which has no React. These two controls
are its React side. They are registered into slots, so the shell shows them
without importing this package.

## How to use

```sh
pnpm add @statewalker/workspace.view.react
```

Peer dependencies: `react` and `react-dom` (`>=18`).

| Import | Provides |
| --- | --- |
| `@statewalker/workspace.view.react` | Only the default export (the fragment init); no named exports |
| `@statewalker/workspace.view.react/fragment` | Default export: `init(ctx)` returning `() => Promise<void>` |
| `@statewalker/workspace.view.react/styles` | Tailwind v4 `@source` globs |

```ts
import "@statewalker/workspace.view.react/styles";
import initWorkspaceView from "@statewalker/workspace.view.react/fragment";

const cleanup = initWorkspaceView(ctx);
// later
await cleanup();
```

The full-screen folder picker shown before a workspace is open is
`DirectoryPickerEmptyState` in `@statewalker/ui.view.react`, not here.

## Examples

### What the init registers

```
core:views
  "workspace:label-header"   -> WorkspaceLabelHeader
  "workspace:switch-button"  -> SwitchWorkspaceButton
dock:header-items
  { id: "workspace:label", slot: "leading", order: 0, viewKey: "workspace:label-header" }
```

The switch button is registered as a view only. To show it, contribute it
yourself, for example in the header:

```ts
import { Slots } from "@statewalker/shared-slots";
import { dockHeaderItemsSlot } from "@statewalker/shell.core";

workspace.requireAdapter(Slots).provide(dockHeaderItemsSlot, {
  id: "workspace:switch",
  slot: "trailing",
  viewKey: "workspace:switch-button",
});
```

## Internals

### Switching is disconnect, then change

The button calls `WorkspaceDisconnectCommand` and then
`ChangeWorkspaceCommand`. The change handler alone does not clear the stored
folder handle in IndexedDB; disconnect does, and it also closes the workspace
so `onUnload` listeners run. If the user cancels the folder picker, the
`AbortError` is ignored and the app stays in the `empty` state: the previous
workspace is already closed.

### The label

The label shows the folder name when the status is `ready` or
`needs-permission`, and is empty otherwise. The product name `SandClaw` is
hard-coded in the component.

### State stays in the adapter

The components hold no state of their own. They read
`WorkspaceShellAdapter.getState()` through `useAdapterValue`, so they need an
`<AppWorkspaceProvider>` ancestor (provided by `<AppRoot>` in
`@statewalker/ui.view.react`).

`src/internal/reconnect-banner.tsx` contains a compact "needs permission"
banner. It is not exported or registered.

### Dependencies

- `@statewalker/workspace.browser` — `WorkspaceShellAdapter`, `ChangeWorkspaceCommand`, `WorkspaceDisconnectCommand`.
- `@statewalker/workspace.core` — `getWorkspace(ctx)`.
- `@statewalker/ui.view.react` — `coreViewsSlot`, `useAdapter`, `useAdapterValue`.
- `@statewalker/ui.view.shadcn` — `Button`.
- `@statewalker/shell.core` — `dockHeaderItemsSlot`.
- `@statewalker/shared-slots`, `@statewalker/shared-commands`, `@statewalker/shared-registry` — slot registration, command bus, grouped cleanup.
- `lucide-react` — icons.

## License

MIT
