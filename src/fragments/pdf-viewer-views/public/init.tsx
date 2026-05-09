import { defineRegistry } from "@json-render/react";
import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import { CatalogRegistry } from "@/fragments/catalog-registry";
import {
  PDF_VIEWER_CATALOG_ID,
  pdfViewerCatalog,
} from "@/fragments/pdf-viewer";
import { PdfView } from "../internal/pdf-view.js";

/**
 * Renderer-fragment init for `pdf-viewer-views` (per ADR 0002).
 * Builds the json-render registry binding the React `PdfView` to the
 * `PdfView` component type in `pdfViewerCatalog`, then registers the
 * resolved entry into `CatalogRegistry` under `PDF_VIEWER_CATALOG_ID`.
 */
export default function initPdfViewerViews(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const catalogs = workspace.requireAdapter(CatalogRegistry);

  const { registry } = defineRegistry(pdfViewerCatalog, {
    components: {
      PdfView: ({ props }) => <PdfView uri={props.uri} />,
    },
    actions: {},
  });

  register(catalogs.register(PDF_VIEWER_CATALOG_ID, registry));

  return cleanup;
}
