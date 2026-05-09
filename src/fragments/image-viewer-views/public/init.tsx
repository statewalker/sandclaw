import { defineRegistry } from "@json-render/react";
import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import { CatalogRegistry } from "@/fragments/catalog-registry";
import {
  IMAGE_VIEWER_CATALOG_ID,
  imageViewerCatalog,
} from "@/fragments/image-viewer";
import { ImageView } from "../internal/image-view.js";

/**
 * Renderer-fragment init for `image-viewer-views` (per ADR 0002).
 * Builds the json-render registry binding the React `ImageView` to
 * the `ImageView` component type in `imageViewerCatalog`, then
 * registers the resolved entry into `CatalogRegistry` under
 * `IMAGE_VIEWER_CATALOG_ID`.
 */
export default function initImageViewerViews(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const catalogs = workspace.requireAdapter(CatalogRegistry);

  const { registry } = defineRegistry(imageViewerCatalog, {
    components: {
      ImageView: ({ props }) => <ImageView uri={props.uri} />,
    },
    actions: {},
  });

  register(catalogs.register(IMAGE_VIEWER_CATALOG_ID, registry));

  return cleanup;
}
