# @statewalker/mime.view.video

## What it is

A view fragment that opens video files in a dock tab. It adds a
`MimeRenderer` for `video/*` to the `files:mime-renderers` slot of
`@statewalker/mime.core`, registers the `video-viewer` json-render catalog, and
binds its `VideoView` component, which loads the file and
plays it in a `<video controls>` element.

## Why it exists

`@statewalker/mime.core` sends a file URI to whichever renderer claims its
MIME type, but contains no viewers. This package is the video viewer. After it is
activated, `files:visualize` (`VisualizeFileCommand`) on a file of type `video/*`
opens a tab here.

## How to use

```sh
pnpm add @statewalker/mime.view.video
```

Peer dependencies: `react` and `react-dom` (`>=18`). Browser only (uses
`Blob` and `URL.createObjectURL`).

| Import | Provides |
| --- | --- |
| `@statewalker/mime.view.video` | Catalog and id helpers listed below; default export is the fragment init |
| `@statewalker/mime.view.video/fragment` | Default export: `init(ctx)` returning `() => Promise<void>` |
| `@statewalker/mime.view.video/styles` | Tailwind v4 `@source` globs |

```ts
import "@statewalker/mime.view.video/styles";
import init from "@statewalker/mime.view.video/fragment";

const cleanup = init(ctx); // after the mime.core, render.core and shell.core logic fragments
```

The init registers the catalog, provides the `video/*` renderer, adds a `FileVideo`
icon for tabs whose id starts with `video-viewer:`, and, each time the workspace
opens, creates specs for `video-viewer:` tabs in the saved layout.

## Examples

### Open a file

```ts
import { VisualizeFileCommand } from "@statewalker/mime.core";

await commands.call(VisualizeFileCommand, { uri: "file:///clips/intro.mp4" }).promise;
```

### Build the panel plan yourself

```ts
import { VIDEO_VIEWER_CATALOG_ID, makeVideoSpec, videoViewerPanelId, videoViewerSpecId } from "@statewalker/mime.view.video";

const uri = "file:///clips/intro.mp4";
const plan = {
  catalogId: VIDEO_VIEWER_CATALOG_ID, // "video-viewer"
  spec: makeVideoSpec(uri),
  panelId: videoViewerPanelId(uri),
  specId: videoViewerSpecId(uri),
};
```

This is what the registered `MimeRenderer.buildPanel(uri)` returns. Panel
and spec ids are derived from the URI, so opening the same file again focuses
the existing tab.

Public exports: `videoViewerCatalog` (the typed catalog), `VIDEO_VIEWER_CATALOG_ID`, `makeVideoSpec`, `videoViewerPanelId`, `videoViewerSpecId`.
The `VideoView` component itself is not exported.

## Internals

### Loading

`VideoView` calls `LoadFileCommand` (`files:load-file`) on mount and keeps a
loading / ready / error state. A failed load shows `Failed to load file` and
the error message in the tab. The bytes are wrapped in a `Blob` with the loaded MIME type (`video/mp4` when unknown) and played from a `blob:` URL, which is revoked on unmount or when the URI changes. The element includes an empty `<track kind="captions">`.

### Why specs are created on workspace open

The dock restores tabs from the saved layout (read from the `LayoutStore`
adapter). A restored tab without a spec shows `Spec <specId> is missing.` The
init therefore creates a spec for every saved `video-viewer:` tab when the workspace
opens. The spec holds only `{ uri }`; the component reads the file itself.

### Constraints

- The whole file is read into memory before playback starts; nothing is streamed, so large videos take long to open and use a lot of memory.
- Codec and container support is the browser's. An unsupported codec shows a video element that does not play.

### Dependencies

- `@statewalker/mime.core` — `mimeRenderersSlot`.
- `@statewalker/render.core`, `@statewalker/render.view.react`, `@json-render/core`, `zod` — catalog, specs, `SpecStore`, `LayoutStore`, `defineRegistry`.
- `@statewalker/shell.view.react` — `dockTabIconSlot`.
- `@statewalker/workspace.core` — `LoadFileCommand`, `getWorkspace`.
- `@statewalker/ui.view.react` — `useAppWorkspace`.
- `@statewalker/shared-commands`, `@statewalker/shared-slots`, `@statewalker/shared-registry` — fragment wiring.
- `lucide-react` — the `FileVideo` icon.
- `@statewalker/workspace.view.react` — declared but not imported by the source.

## License

MIT
