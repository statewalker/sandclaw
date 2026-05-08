import { defineRegistry } from "@json-render/react";
import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import { CatalogRegistry } from "@/fragments/catalog-registry";
import {
  MARKDOWN_VIEWER_CATALOG_ID,
  markdownViewerCatalog,
} from "@/fragments/markdown-viewer";
import { MarkdownView } from "../internal/markdown-view.js";

/**
 * Renderer-fragment init for `markdown-viewer-views` (per ADR 0002).
 * Builds the json-render registry binding the React `MarkdownView`
 * to the `MarkdownView` component type in `markdownViewerCatalog`,
 * then registers the resolved entry into `CatalogRegistry` under
 * `MARKDOWN_VIEWER_CATALOG_ID`.
 *
 * Boot order: register AFTER the logic-fragment block (so the
 * catalog declaration exists), alongside the other renderer
 * fragments, BEFORE the dock host mounts.
 */
export function initMarkdownViewerViews(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const catalogs = workspace.requireAdapter(CatalogRegistry);

  const { registry } = defineRegistry(markdownViewerCatalog, {
    components: {
      MarkdownView: ({ props }) => <MarkdownView uri={props.uri} />,
    },
    actions: {},
  });

  register(catalogs.register(MARKDOWN_VIEWER_CATALOG_ID, registry));

  return cleanup;
}
