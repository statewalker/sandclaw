import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace-api";
import { provideMimeRenderer } from "@/fragments/files";
import {
  MARKDOWN_VIEWER_CATALOG_ID,
  makeMarkdownSpec,
  markdownViewerPanelId,
  markdownViewerSpecId,
} from "./catalog.js";

/**
 * Logic-fragment init for `markdown-viewer`. Contributes a
 * `MimeRenderer` to the `files:mime-renderers` slot whose
 * `buildPanel(uri)` returns the deterministic ids + spec for opening
 * a markdown panel. Pairs with the `markdown-viewer-views` renderer
 * fragment (catalog binding lives there).
 *
 * Boot order: register AFTER `initFiles` (the slot must be
 * declared) and BEFORE the renderer fragment block so the
 * contribution is observable when the catalog binding lands.
 */
export function initMarkdownViewer(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);

  register(
    provideMimeRenderer(slots, {
      mimeTypePattern: "text/markdown",
      buildPanel(uri) {
        return {
          catalogId: MARKDOWN_VIEWER_CATALOG_ID,
          spec: makeMarkdownSpec(uri),
          panelId: markdownViewerPanelId(uri),
          specId: markdownViewerSpecId(uri),
        };
      },
    }),
  );

  return cleanup;
}
