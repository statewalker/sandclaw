import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace-api";
import { provideMimeRenderer } from "@/fragments/files";
import {
  makeVideoSpec,
  VIDEO_VIEWER_CATALOG_ID,
  videoViewerPanelId,
  videoViewerSpecId,
} from "./catalog.js";

/**
 * Logic-fragment init for `video-viewer`. Contributes a `MimeRenderer`
 * to the `files:mime-renderers` slot for `video/*` whose
 * `buildPanel(uri)` returns the deterministic ids + spec for opening
 * a video panel. Pairs with the `video-viewer-views` renderer
 * fragment.
 */
export default function initVideoViewer(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);

  register(
    provideMimeRenderer(slots, {
      mimeTypePattern: "video/*",
      buildPanel(uri) {
        return {
          catalogId: VIDEO_VIEWER_CATALOG_ID,
          spec: makeVideoSpec(uri),
          panelId: videoViewerPanelId(uri),
          specId: videoViewerSpecId(uri),
        };
      },
    }),
  );

  return cleanup;
}
