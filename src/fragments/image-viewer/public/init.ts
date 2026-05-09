import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace-api";
import { provideMimeRenderer } from "@/fragments/files";
import {
  IMAGE_VIEWER_CATALOG_ID,
  imageViewerPanelId,
  imageViewerSpecId,
  makeImageSpec,
} from "./catalog.js";

/**
 * Logic-fragment init for `image-viewer`. Contributes a `MimeRenderer`
 * to the `files:mime-renderers` slot for `image/*` whose
 * `buildPanel(uri)` returns the deterministic ids + spec for opening
 * an image panel. Pairs with the `image-viewer-views` renderer
 * fragment (catalog binding lives there).
 */
export default function initImageViewer(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);

  register(
    provideMimeRenderer(slots, {
      mimeTypePattern: "image/*",
      buildPanel(uri) {
        return {
          catalogId: IMAGE_VIEWER_CATALOG_ID,
          spec: makeImageSpec(uri),
          panelId: imageViewerPanelId(uri),
          specId: imageViewerSpecId(uri),
        };
      },
    }),
  );

  return cleanup;
}
