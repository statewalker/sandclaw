# @statewalker/mime.view.image

## What it is

A view fragment that opens image files in a dock tab. It adds a
`MimeRenderer` for `image/*` to the `files:mime-renderers` slot of
`@statewalker/mime.core`, registers the `image-viewer` json-render catalog, and
binds its `ImageView` component, which loads the file and
shows it in an `<img>`.

## Why it exists

`@statewalker/mime.core` sends a file URI to whichever renderer claims its
MIME type, but contains no viewers. This package is the image viewer. After it is
activated, `files:visualize` (`VisualizeFileCommand`) on a file of type `image/*`
opens a tab here.

## How to use

```sh
pnpm add @statewalker/mime.view.image
```

Peer dependencies: `react` and `react-dom` (`>=18`). Browser only (uses
`Blob` and `URL.createObjectURL`).

| Import | Provides |
| --- | --- |
| `@statewalker/mime.view.image` | Catalog and id helpers listed below; default export is the fragment init |
| `@statewalker/mime.view.image/fragment` | Default export: `init(ctx)` returning `() => Promise<void>` |
| `@statewalker/mime.view.image/styles` | Tailwind v4 `@source` globs |

```ts
import "@statewalker/mime.view.image/styles";
import init from "@statewalker/mime.view.image/fragment";

const cleanup = init(ctx); // after the mime.core, render.core and shell.core logic fragments
```

The init registers the catalog, provides the `image/*` renderer, adds a `FileImage`
icon for tabs whose id starts with `image-viewer:`, and, each time the workspace
opens, creates specs for `image-viewer:` tabs in the saved layout.

## Examples

### Open a file

```ts
import { VisualizeFileCommand } from "@statewalker/mime.core";

await commands.call(VisualizeFileCommand, { uri: "file:///photos/cat.png" }).promise;
```

### Build the panel plan yourself

```ts
import { IMAGE_VIEWER_CATALOG_ID, makeImageSpec, imageViewerPanelId, imageViewerSpecId } from "@statewalker/mime.view.image";

const uri = "file:///photos/cat.png";
const plan = {
  catalogId: IMAGE_VIEWER_CATALOG_ID, // "image-viewer"
  spec: makeImageSpec(uri),
  panelId: imageViewerPanelId(uri),
  specId: imageViewerSpecId(uri),
};
```

This is what the registered `MimeRenderer.buildPanel(uri)` returns. Panel
and spec ids are derived from the URI, so opening the same file again focuses
the existing tab.

Public exports: `imageViewerCatalog` (the typed catalog), `IMAGE_VIEWER_CATALOG_ID`, `makeImageSpec`, `imageViewerPanelId`, `imageViewerSpecId`.
The `ImageView` component itself is not exported.

## Internals

### Loading

`ImageView` calls `LoadFileCommand` (`files:load-file`) on mount and keeps a
loading / ready / error state. A failed load shows `Failed to load file` and
the error message in the tab. The bytes are wrapped in a `Blob` with the loaded MIME type (`image/png` when unknown) and shown through a `blob:` URL, which is revoked on unmount or when the URI changes.

### Why specs are created on workspace open

The dock restores tabs from the saved layout (read from the `LayoutStore`
adapter). A restored tab without a spec shows `Spec <specId> is missing.` The
init therefore creates a spec for every saved `image-viewer:` tab when the workspace
opens. The spec holds only `{ uri }`; the component reads the file itself.

### Constraints

- Shows what the browser can display in an `<img>` (raster formats and SVG). No zoom or pan.
- The whole file is read into memory.

### Dependencies

- `@statewalker/mime.core` — `mimeRenderersSlot`.
- `@statewalker/render.core`, `@statewalker/render.view.react`, `@json-render/core`, `zod` — catalog, specs, `SpecStore`, `LayoutStore`, `defineRegistry`.
- `@statewalker/shell.view.react` — `dockTabIconSlot`.
- `@statewalker/workspace.core` — `LoadFileCommand`, `getWorkspace`.
- `@statewalker/ui.view.react` — `useAppWorkspace`.
- `@statewalker/shared-commands`, `@statewalker/shared-slots`, `@statewalker/shared-registry` — fragment wiring.
- `lucide-react` — the `FileImage` icon.
- `@statewalker/workspace.view.react` — declared but not imported by the source.

## License

MIT
