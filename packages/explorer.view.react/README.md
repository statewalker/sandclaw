# @statewalker/explorer.view.react

## What it is

A view fragment for file-explorer tabs in the dock. Each tab shows one folder
as a list with breadcrumbs, a filter and drag and drop. The fragment binds the
`file-explorer` json-render catalog to React, opens the panel presets from
`@statewalker/explorer.core` when a workspace opens, and handles the
`file-explorer:new-panel` command.

## Why it exists

`@statewalker/explorer.core` holds the models, the panel controller, the
commands, the slots and the spec helpers, with no React. This package turns
them into dock tabs. The schema-typed catalog (`fileExplorerCatalog`) lives
here because building it needs json-render's React `schema`.

## How to use

```sh
pnpm add @statewalker/explorer.view.react
```

Peer dependencies: `react` and `react-dom` (`>=18`).

| Import | Provides |
| --- | --- |
| `@statewalker/explorer.view.react` | `FileExplorerPanel`, `FileExplorerPanelProps`, `FilesListView`; default export is the fragment init |
| `@statewalker/explorer.view.react/fragment` | Default export: `init(ctx)` returning `() => Promise<void>` |
| `@statewalker/explorer.view.react/styles` | Tailwind v4 `@source` globs |

Activate it after the `explorer.core`, `render.core` and `shell.core` logic
fragments:

```ts
import "@statewalker/explorer.view.react/styles";
import initExplorerView from "@statewalker/explorer.view.react/fragment";

const cleanup = initExplorerView(ctx);
```

The init:

1. Registers the catalog under `FILE_EXPLORER_CATALOG_ID` in `json:catalogs`.
2. Adds a folder icon for tabs whose id starts with `file-explorer:`.
3. On workspace open, creates specs for `file-explorer:` tabs in the saved
   layout (from the `LayoutStore` adapter), then opens one dock tab per entry
   in the `file-explorer:panels` preset slot.
4. Listens for `NewFileExplorerPanelCommand` (`file-explorer:new-panel`).

## Examples

### Open a new explorer tab

```ts
import { NewFileExplorerPanelCommand } from "@statewalker/explorer.core";

const { panelId } = await commands.call(NewFileExplorerPanelCommand, {
  initialPath: "/docs",
  label: "Docs",
  position: "right",
}).promise;
```

Defaults: `initialPath` `"/"`, `label` `"Files"`, `position` `"within"`. The
result's `panelId` is the generated id (`panel-<8 hex chars>`); the dock tab id
is `file-explorer:` followed by it.

### Mount one panel outside the dock

```tsx
import { FileExplorerPanel } from "@statewalker/explorer.view.react";

<FileExplorerPanel panelId="left" initialPath="/" label="Files" folderNavigationHost />;
```

`FileExplorerPanelProps`: `panelId` (required), `initialPath`, `label`,
`mainViewerHost`, `folderNavigationHost`. The panel needs an
`<AppWorkspaceProvider>` ancestor.

`FilesListView` (`{ model, panelId, onOpen }`) is the list itself, for hosts
that create their own `FilesListModel`.

## Internals

### How presets become tabs

Presets are sorted by `order`, then `id`. The first opens at the default
position. Each next one with `side: "left"` or `"right"` splits on that side;
`side: "main"` or no side adds a tab to the previous group. Opened preset ids
are remembered until the workspace unloads, so presets added later (the slot
is observed) do not duplicate tabs. A failed `dock:show-panel` is logged as
`[file-explorer] failed to open dock panel:` and the other presets still open.

### Why specs are created before the layout is restored

The dock restores tabs from the saved layout. A tab whose spec does not exist
yet shows `Spec <specId> is missing.` To avoid that, the init creates a
default spec for every saved `file-explorer:` tab first. When a preset for the
same id arrives, the spec is patched with the preset's label and flags.

### Navigation

Every activation (folder click, double-click, Enter, Backspace, breadcrumb)
calls `files:open` with this panel as both `origin`
and `target`, so folders open in place. One click opens a folder; a file needs
a double-click or Enter, so that a single click can start a drag. Each panel
registers itself in `activeFileExplorerPanelsSlot` so the `files:open` handler
in `explorer.core` can route to it.

### Not implemented

There is no tree view, context menu or search panel in this package.

### Dependencies

- `@statewalker/explorer.core` — models, controller, commands, slots, spec helpers.
- `@statewalker/render.core`, `@statewalker/render.view.react` — `SpecStore`, `LayoutStore`, `json:catalogs`, `defineRegistry`, `schema`.
- `@statewalker/shell.core`, `@statewalker/shell.view.react` — `ShowDockPanelCommand`, `dockTabIconSlot`.
- `@statewalker/mime.core` — `OpenCommand` (`files:open`).
- `@statewalker/ui.view.react` — hooks, `compareByOrderAndId`.
- `@statewalker/shared-commands`, `@statewalker/shared-slots`, `@statewalker/shared-registry`, `@statewalker/workspace.core` — fragment wiring.
- `@json-render/core`, `zod`, `lucide-react`.
- `@statewalker/ui.view.shadcn`, `@statewalker/shared-baseclass`, `@statewalker/webrun-files` — declared but not imported by the source.

## License

MIT
