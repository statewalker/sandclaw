import { defineRegistry } from "@json-render/react";
import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import { CatalogRegistry } from "@/fragments/catalog-registry";
import {
  VIDEO_VIEWER_CATALOG_ID,
  videoViewerCatalog,
} from "@/fragments/video-viewer";
import { VideoView } from "../internal/video-view.js";

/**
 * Renderer-fragment init for `video-viewer-views` (per ADR 0002).
 * Builds the json-render registry binding the React `VideoView` to
 * the `VideoView` component type in `videoViewerCatalog`, then
 * registers the resolved entry into `CatalogRegistry` under
 * `VIDEO_VIEWER_CATALOG_ID`.
 */
export default function initVideoViewerViews(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const catalogs = workspace.requireAdapter(CatalogRegistry);

  const { registry } = defineRegistry(videoViewerCatalog, {
    components: {
      VideoView: ({ props }) => <VideoView uri={props.uri} />,
    },
    actions: {},
  });

  register(catalogs.register(VIDEO_VIEWER_CATALOG_ID, registry));

  return cleanup;
}
