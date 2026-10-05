# @statewalker/app-shell

## What it is

The boot helper the apps in this repository start from. `bootShell()` registers the workbench substrate in a fixed order (platform, spec store, dock, workspace bridge, settings, files, inline content, then the React mount, shadcn, dock, settings and file viewers, and a menubar), then runs the app's own logic and renderer fragments on top. `bootHeadless()` registers the same logic substrate without React or a DOM, for Node and tests. This package is private: it is used through `workspace:^` inside this repository and is not published.

## Why it exists

Every app built on the workbench needs the same substrate fragments in the same order, and the order matters: renderer fragments read slot snapshots that logic fragments must already have filled. Keeping that order in one function means an app only lists what it adds. The logic part (`bootLogic`) takes the two host-specific pieces, the platform and how the workspace gets its `FilesApi`, as parameters, so the same sequence runs in a browser and headless.

## How to use

Add it to an app in this workspace:

```json
"dependencies": { "@statewalker/app-shell": "workspace:^" }
```

Peer dependencies: `react` and `react-dom` (^19.3.0). There is one entry point, `.` (`src/index.ts`; the package ships TypeScript sources, so the app's bundler must compile them).

| Export | What it does |
| --- | --- |
| `bootShell(options?)` | Browser boot. Returns `{ workspace, ctx, cleanup }` and calls `cleanup()` on `beforeunload`. |
| `bootHeadless({ files, platform?, logic?, onLogicReady? })` | Logic-only boot over the given `FilesApi`. Default platform: `initPlatformNode`. |
| `bootLogic(ctx, register, { platform, provisionWorkspace, logic?, onLogicReady? })` | The shared logic sequence both boots use. |
| `initPlatformNode` | Re-export of `@statewalker/platform.node`'s fragment. |
| `menubarItemsSlot`, `MenubarItem` | Slot for menubar entries (`app-shell:menubar-items`). |
| `FragmentInit` and the option/result types | `(ctx) => cleanup`, the shape of every fragment init. |

## Examples

### Boot a browser app

```ts
import { bootShell } from "@statewalker/app-shell";
import "@statewalker/shell.view.react/styles"; // CSS imports stay in the app

bootShell({
  logic: [initMyLogic],
  onLogicReady: (ctx, register) => {
    register(initMyMenu(ctx));
  },
  renderers: [initMyReact],
});
```

### Add a menubar entry

```ts
import { menubarItemsSlot } from "@statewalker/app-shell";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace.core";
import { FilePlus } from "lucide-react";

export default function initMyMenu(ctx: Record<string, unknown>) {
  const slots = getWorkspace(ctx).requireAdapter(Slots);
  return slots.provide(menubarItemsSlot, {
    id: "files:new",
    menu: "Files",
    order: 10,
    label: "New file",
    Icon: FilePlus,
    onActivate: () => { /* dispatch a command */ },
  });
}
```

Items with the same `menu` label share one dropdown; dropdowns are ordered by the lowest `order` of their items (default 100). The shell contributes the System menu itself.

### Boot headless in a test

```ts
import { bootHeadless } from "@statewalker/app-shell";
import { MemFilesApi } from "@statewalker/webrun-files-mem";

const { workspace, cleanup } = bootHeadless({ files: new MemFilesApi(), logic: [initMyLogic] });
// workspace.open() was started but not awaited: wait for workspace.onLoad before asserting.
await cleanup();
```

## Internals

### Why the boot order is fixed

`bootLogic` runs: platform, spec store, dock, workspace provisioning, settings, workspace files, files, inline content, app logic, then `onLogicReady`. `bootShell` then registers the React mount (`ui.view.react`) first, so later renderers find the workspace provider in scope, followed by shadcn, workspace bridge view, dock view, settings view, the markdown/image/pdf/video viewers, inline content view, the menubar, and finally the app's renderers. `onLogicReady` exists for contributions that must be in a slot before a renderer's init reads its snapshot. Cleanups run in reverse order.

### Constraints

- CSS is not imported here. Tailwind and shadcn cascade depends on import order, so each app imports the style bundles it needs.
- `bootShell` applies the saved theme before React mounts, so the first paint already uses the user's theme.
- The default `QueryClient` uses `{ retry: false, refetchOnWindowFocus: false }`; pass `queryClientOptions` to change it.
- `bootHeadless` opens the workspace without awaiting it.

### Dependencies

The substrate fragments it boots (`@statewalker/platform.*`, `render.core`, `shell.*`, `settings.*`, `workspace.*`, `mime.*`, `inline.*`, `ui.view.*`), `@statewalker/shared-registry` and `shared-slots` for cleanup tracking and the menubar slot, `@tanstack/react-query` for the shared `QueryClient`, and `lucide-react` for menubar icons.

## License

MIT. See [LICENSE](../../LICENSE).
