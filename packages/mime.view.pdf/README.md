# @statewalker/mime.view.pdf

## What it is

A view fragment that opens PDF files in a dock tab. It adds a
`MimeRenderer` for `application/pdf` to the `files:mime-renderers` slot of
`@statewalker/mime.core`, registers the `pdf-viewer` json-render catalog, and
binds its `PdfView` component, which loads the file and
shows it with the browser's built-in PDF viewer (`<embed type="application/pdf">`).

## Why it exists

`@statewalker/mime.core` sends a file URI to whichever renderer claims its
MIME type, but contains no viewers. This package is the PDF viewer. After it is
activated, `files:visualize` (`VisualizeFileCommand`) on a file of type `application/pdf`
opens a tab here.

## How to use

```sh
pnpm add @statewalker/mime.view.pdf
```

Peer dependencies: `react` and `react-dom` (`>=18`). Browser only (uses
`Blob` and `URL.createObjectURL`).

| Import | Provides |
| --- | --- |
| `@statewalker/mime.view.pdf` | Catalog and id helpers listed below; default export is the fragment init |
| `@statewalker/mime.view.pdf/fragment` | Default export: `init(ctx)` returning `() => Promise<void>` |
| `@statewalker/mime.view.pdf/styles` | Tailwind v4 `@source` globs |

```ts
import "@statewalker/mime.view.pdf/styles";
import init from "@statewalker/mime.view.pdf/fragment";

const cleanup = init(ctx); // after the mime.core, render.core and shell.core logic fragments
```

The init registers the catalog, provides the `application/pdf` renderer, adds a `FileText`
icon for tabs whose id starts with `pdf-viewer:`, and, each time the workspace
opens, creates specs for `pdf-viewer:` tabs in the saved layout.

## Examples

### Open a file

```ts
import { VisualizeFileCommand } from "@statewalker/mime.core";

await commands.call(VisualizeFileCommand, { uri: "file:///docs/report.pdf" }).promise;
```

### Build the panel plan yourself

```ts
import { PDF_VIEWER_CATALOG_ID, makePdfSpec, pdfViewerPanelId, pdfViewerSpecId } from "@statewalker/mime.view.pdf";

const uri = "file:///docs/report.pdf";
const plan = {
  catalogId: PDF_VIEWER_CATALOG_ID, // "pdf-viewer"
  spec: makePdfSpec(uri),
  panelId: pdfViewerPanelId(uri),
  specId: pdfViewerSpecId(uri),
};
```

This is what the registered `MimeRenderer.buildPanel(uri)` returns. Panel
and spec ids are derived from the URI, so opening the same file again focuses
the existing tab.

Public exports: `pdfViewerCatalog` (the typed catalog), `PDF_VIEWER_CATALOG_ID`, `makePdfSpec`, `pdfViewerPanelId`, `pdfViewerSpecId`.
The `PdfView` component itself is not exported.

## Internals

### Loading

`PdfView` calls `LoadFileCommand` (`files:load-file`) on mount and keeps a
loading / ready / error state. A failed load shows `Failed to load file` and
the error message in the tab. The bytes are wrapped in a `Blob` of type `application/pdf` and passed to the `<embed>` as a `blob:` URL, which is revoked on unmount or when the URI changes.

### Why specs are created on workspace open

The dock restores tabs from the saved layout (read from the `LayoutStore`
adapter). A restored tab without a spec shows `Spec <specId> is missing.` The
init therefore creates a spec for every saved `pdf-viewer:` tab when the workspace
opens. The spec holds only `{ uri }`; the component reads the file itself.

### Constraints

- No PDF engine is bundled. A browser without a built-in PDF viewer (many mobile browsers, some locked-down setups) shows an empty area or a download prompt instead of the document.
- Search, annotation and page navigation are whatever the browser's viewer offers.
- The whole file is read into memory.

### Dependencies

- `@statewalker/mime.core` — `mimeRenderersSlot`.
- `@statewalker/render.core`, `@statewalker/render.view.react`, `@json-render/core`, `zod` — catalog, specs, `SpecStore`, `LayoutStore`, `defineRegistry`.
- `@statewalker/shell.view.react` — `dockTabIconSlot`.
- `@statewalker/workspace.core` — `LoadFileCommand`, `getWorkspace`.
- `@statewalker/ui.view.react` — `useAppWorkspace`.
- `@statewalker/shared-commands`, `@statewalker/shared-slots`, `@statewalker/shared-registry` — fragment wiring.
- `lucide-react` — the `FileText` icon.
- `@statewalker/workspace.view.react` — declared but not imported by the source.

## License

MIT
