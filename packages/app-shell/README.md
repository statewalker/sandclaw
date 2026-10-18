# @statewalker/app-shell

## What it is

The boot the apps in this repository start from. `bootShell()` creates the app context for a `Workspace` and hands the workbench substrate plus the app's own fragments to the kernel (`@statewalker/kernel.core`).

- The substrate is split into logic and renderers.
  - Logic: platform, spec store, dock, workspace bridge, settings, workspace files, file viewers, inline content.
  - Renderers: the React mount, shadcn, dock, settings and file-viewer views, and a menubar.
- The kernel orders all fragments by what each one `requires`, then activates them.
- `bootHeadless()` boots the logic substrate without React or a DOM, for Node and for tests. It lives in the separate `./headless` entry, so browser bundles never load `platform.node`.

This package is private: it is used through `workspace:^` inside this repository and is not published.

## Why it exists

Every app built on the workbench needs the same substrate, and some of it must come before the rest: renderers need the adapters that logic fragments register. The substrate's fragments carry stable ids (`SUBSTRATE`) and their requirements. An app therefore lists only what it adds and names what that needs, instead of relying on where it is placed in a list.

`createWorkspaceContext` makes the workspace's `Slots` and `Commands` adapters the kernel's own buses. Older fragments call `workspace.requireAdapter(Slots)`, newer ones call `getSlots(ctx)`, and both reach the same bus.

## How to use

Add it to an app in this workspace:

```json
"dependencies": { "@statewalker/app-shell": "workspace:^" }
```

Peer dependencies: `react` and `react-dom` (^19.3.0). The package ships TypeScript sources, so the app's bundler compiles them.

| Import | Export | What it does |
| --- | --- | --- |
| `.` | `bootShell({ fragments?, config?, onError?, queryClientOptions? })` | Browser boot. Returns `{ workspace, ctx, kernel, ready, cleanup }` and stops the kernel on `beforeunload`. |
| `.` | `SUBSTRATE` | Ids of the substrate fragments, for `requires`. |
| `.` | `substrateLogic`, `substrateRenderers` | The substrate as kernel fragments, for custom boots. |
| `.` | `createWorkspaceContext(workspace)` | An app context whose buses are shared with the workspace's adapters. |
| `.` | `SwitchWorkspaceCommand` | `app-shell:switch-workspace`, answered by the menubar fragment. |
| `.` | `menubarItemsSlot`, `MenubarItem` | Legacy menubar entries that carry a closure. Prefer kernel actions. |
| `./headless` | `bootHeadless({ files, platform?, fragments?, config? })` | Logic-only boot over the given `FilesApi`. The default platform is `initPlatformNode`. |
| `./headless` | `initPlatformNode` | Re-export of `@statewalker/platform.node`'s fragment. |

The `logic`, `renderers` and `onLogicReady` options still work, but they are deprecated. They become fragments with generated ids.

## Examples

### Boot a browser app

```ts
import { bootShell, SUBSTRATE } from "@statewalker/app-shell";
import { fromInit } from "@statewalker/kernel.core";
import "@statewalker/shell.view.react/styles"; // CSS imports stay in the app

bootShell({
  fragments: [
    fromInit("notes", initNotes, { requires: [SUBSTRATE.workspace] }),
    fromInit("notes.menu", initNotesMenu, { requires: ["notes"] }),
    fromInit("notes.view", initNotesReact, { requires: [SUBSTRATE.dockReact, "notes"] }),
    { id: "charts", requires: [SUBSTRATE.react], load: () => import("@acme/charts/fragment") },
  ],
});
```

App fragments are listed right after the logic substrate. A renderer fragment requires `SUBSTRATE.react`, or the substrate view it builds on, so that it comes after the React mount.

### Add a menu entry

```ts
import { defineAction, provideAction } from "@statewalker/kernel.core";
import { FilePlus } from "lucide-react";

export default function initNotesMenu(ctx) {
  return provideAction(
    ctx,
    defineAction(NewNoteCommand, {}, { id: "notes:new", menu: "Notes", order: 10, label: "New note", icon: FilePlus }),
  );
}
```

The menubar renders every action that has a `menu`. Items with the same `menu` share one dropdown; dropdowns are ordered by the lowest `order` of their items (default 100). Activating an entry calls the action's command. The shell contributes the System menu itself (Settings, Switch workspace).

### Boot headless in a test

```ts
import { bootHeadless } from "@statewalker/app-shell/headless";
import { MemFilesApi } from "@statewalker/webrun-files-mem";

const { workspace, kernel, ready, cleanup } = bootHeadless({
  files: new MemFilesApi(),
  fragments: [myFragment],
});
await ready;
// workspace.open() was started but not awaited: wait for workspace.onLoad before asserting.
await cleanup();
```

## Internals

### Order

The fragments are handed to the kernel in this order: substrate logic, the deprecated `logic` and `onLogicReady`, `fragments`, the substrate renderers, and the deprecated `renderers`. The kernel then moves a fragment only to satisfy a `requires` or an `after`.

The substrate keeps the order it always had: the React mount (`ui.view.react`) comes first among the renderers and the menubar last.

All substrate fragments are synchronous. The kernel activates synchronous fragments synchronously, so React is still mounted before `bootShell` returns; `ready` only waits for lazy or asynchronous app fragments.

### Constraints

- CSS is not imported here. Tailwind and shadcn cascade depends on import order, so each app imports the style bundles it needs.
- `bootShell` applies the saved theme before React mounts, so the first paint already uses the user's theme.
- The `QueryClient` is set through `queryClientAdapter` (`@statewalker/ui.view.react`), the same adapter the React mount reads. Its defaults are `{ retry: false, refetchOnWindowFocus: false }`; pass `queryClientOptions` to change them.
- A fragment that fails is logged and marked `failed`. Fragments that require it are `blocked`; the rest of the app still starts. `kernel.list()` shows each fragment's state.

### Dependencies

- The substrate fragments it boots: `@statewalker/platform.*`, `render.core`, `shell.*`, `settings.*`, `workspace.*`, `mime.*`, `inline.*` and `ui.view.*`.
- `@statewalker/kernel.core` for the loader, context, actions and commands.
- `@tanstack/react-query` for the shared `QueryClient`.
- `lucide-react` for menubar icons.

## License

MIT. See [LICENSE](../../LICENSE).
