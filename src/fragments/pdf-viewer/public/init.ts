import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace-api";
import { provideMimeRenderer } from "@/fragments/files";
import {
  makePdfSpec,
  PDF_VIEWER_CATALOG_ID,
  pdfViewerPanelId,
  pdfViewerSpecId,
} from "./catalog.js";

/**
 * Logic-fragment init for `pdf-viewer`. Contributes a `MimeRenderer`
 * to the `files:mime-renderers` slot for `application/pdf` whose
 * `buildPanel(uri)` returns the deterministic ids + spec for opening
 * a PDF panel. Pairs with the `pdf-viewer-views` renderer fragment.
 */
export default function initPdfViewer(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);

  register(
    provideMimeRenderer(slots, {
      mimeTypePattern: "application/pdf",
      buildPanel(uri) {
        return {
          catalogId: PDF_VIEWER_CATALOG_ID,
          spec: makePdfSpec(uri),
          panelId: pdfViewerPanelId(uri),
          specId: pdfViewerSpecId(uri),
        };
      },
    }),
  );

  return cleanup;
}
