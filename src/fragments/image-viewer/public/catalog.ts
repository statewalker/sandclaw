import { defineCatalog, type Spec } from "@json-render/core";
import { schema } from "@json-render/react";
import { z } from "zod";

/**
 * Catalog declaration for the image viewer panel — typed schema only.
 * Per ADR 0002 (logic / renderer split), the React binding for
 * `ImageView` lives in the paired `image-viewer-views` renderer
 * fragment.
 *
 * Single component (`ImageView`) whose `uri` prop locks the tab to
 * one file. The tab opens via `files:visualize`; the viewer fragment
 * contributes a `MimeRenderer` that builds the spec keyed by URI so
 * opening the same file twice focuses the existing tab.
 */
export const imageViewerCatalog = defineCatalog(schema, {
  components: {
    ImageView: { props: z.object({ uri: z.string() }) },
  },
  actions: {},
});

export const IMAGE_VIEWER_CATALOG_ID = "image-viewer";

/** Build the one-element spec for `uri`. */
export function makeImageSpec(uri: string): Spec {
  return {
    root: "panel",
    elements: {
      panel: {
        type: "ImageView",
        props: { uri },
        children: [],
      },
    },
  } as Spec;
}

/** Deterministic panel id so reopening the same URI focuses the tab. */
export function imageViewerPanelId(uri: string): string {
  return `image-viewer:${uri}`;
}

/** Deterministic spec id; pairs with `imageViewerPanelId`. */
export function imageViewerSpecId(uri: string): string {
  return `spec:image-viewer:${uri}`;
}
