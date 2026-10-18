import { defineCatalog, type Spec } from "@json-render/core";
import { schema } from "@statewalker/render.view.react";
import { z } from "zod";

/**
 * Catalog declaration for the markdown viewer panel — typed schema
 * only. Per ADR 0002 (logic / renderer split), the React binding
 * for `MarkdownView` lives in the paired `markdown-viewer-views`
 * renderer fragment.
 *
 * Single component (`MarkdownView`) whose `uri` prop locks the tab
 * to one file. The tab opens via `files:visualize`; the viewer
 * fragment contributes a `MimeRenderer` that builds the spec keyed
 * by URI so opening the same file twice focuses the existing tab.
 */
export const markdownViewerCatalog = defineCatalog(schema, {
  components: {
    MarkdownView: { props: z.object({ uri: z.string() }) },
  },
  actions: {},
});

export const MARKDOWN_VIEWER_CATALOG_ID = "markdown-viewer";

/**
 * Build the one-element spec for `uri`. Held opaquely by SpecStore
 * (typed as `unknown`); the `<JsonPanel>` picks it up by id and the
 * markdown-viewer-views renderer binds the React component.
 */
export function makeMarkdownSpec(uri: string): Spec {
  return {
    root: "panel",
    elements: {
      panel: {
        type: "MarkdownView",
        props: { uri },
        children: [],
      },
    },
  } as Spec;
}

/** Deterministic panel id so reopening the same URI focuses the tab. */
export function markdownViewerPanelId(uri: string): string {
  return `markdown-viewer:${uri}`;
}

/** Deterministic spec id; pairs with `markdownViewerPanelId`. */
export function markdownViewerSpecId(uri: string): string {
  return `spec:markdown-viewer:${uri}`;
}
