import { defineCatalog, type Spec } from "@json-render/core";
import { schema } from "@statewalker/render.view.react";
import { z } from "zod";

/**
 * Catalog declaration for the video viewer panel — typed schema only.
 * Per ADR 0002 (logic / renderer split), the React binding for
 * `VideoView` lives in the paired `video-viewer-views` renderer
 * fragment.
 */
export const videoViewerCatalog = defineCatalog(schema, {
  components: {
    VideoView: { props: z.object({ uri: z.string() }) },
  },
  actions: {},
});

export const VIDEO_VIEWER_CATALOG_ID = "video-viewer";

/** Build the one-element spec for `uri`. */
export function makeVideoSpec(uri: string): Spec {
  return {
    root: "panel",
    elements: {
      panel: {
        type: "VideoView",
        props: { uri },
        children: [],
      },
    },
  } as Spec;
}

/** Deterministic panel id so reopening the same URI focuses the tab. */
export function videoViewerPanelId(uri: string): string {
  return `video-viewer:${uri}`;
}

/** Deterministic spec id; pairs with `videoViewerPanelId`. */
export function videoViewerSpecId(uri: string): string {
  return `spec:video-viewer:${uri}`;
}
