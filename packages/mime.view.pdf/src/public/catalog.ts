import { defineCatalog, type Spec } from "@json-render/core";
import { schema } from "@statewalker/render.view.react";
import { z } from "zod";

/**
 * Catalog declaration for the PDF viewer panel — typed schema only.
 * Per ADR 0002 (logic / renderer split), the React binding for
 * `PdfView` lives in the paired `pdf-viewer-views` renderer fragment.
 */
export const pdfViewerCatalog = defineCatalog(schema, {
  components: {
    PdfView: { props: z.object({ uri: z.string() }) },
  },
  actions: {},
});

export const PDF_VIEWER_CATALOG_ID = "pdf-viewer";

/** Build the one-element spec for `uri`. */
export function makePdfSpec(uri: string): Spec {
  return {
    root: "panel",
    elements: {
      panel: {
        type: "PdfView",
        props: { uri },
        children: [],
      },
    },
  } as Spec;
}

/** Deterministic panel id so reopening the same URI focuses the tab. */
export function pdfViewerPanelId(uri: string): string {
  return `pdf-viewer:${uri}`;
}

/** Deterministic spec id; pairs with `pdfViewerPanelId`. */
export function pdfViewerSpecId(uri: string): string {
  return `spec:pdf-viewer:${uri}`;
}
