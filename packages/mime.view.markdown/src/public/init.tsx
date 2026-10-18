import { mimeRenderersSlot } from "@statewalker/mime.core";
import {
  catalogsSlot,
  LayoutStore,
  restorePanelSpecsFromLayout,
  SpecStore,
} from "@statewalker/render.core";
import { defineRegistry } from "@statewalker/render.view.react";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { dockTabIconSlot } from "@statewalker/shell.view.react";
import { getWorkspace } from "@statewalker/workspace.core";
import { FileText } from "lucide-react";
import { MarkdownView } from "../internal/markdown-view.js";
import {
  MARKDOWN_VIEWER_CATALOG_ID,
  makeMarkdownSpec,
  markdownViewerCatalog,
  markdownViewerPanelId,
  markdownViewerSpecId,
} from "./catalog.js";

/**
 * Renderer-only fragment for the markdown MIME viewer (per task 4.11 — the
 * paired logic fragment was dropped; its inert MIME-pattern data lives
 * inline here, registered alongside the catalog binding).
 *
 * Contributes one entry to `files:mime-renderers` for `text/markdown`
 * and one entry to `CatalogRegistry` for `MARKDOWN_VIEWER_CATALOG_ID`.
 */
export default function initMarkdownViewerReact(ctx: Record<string, unknown>): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);
  const store = workspace.requireAdapter(SpecStore);
  const layoutStore = workspace.requireAdapter(LayoutStore);

  // Pre-allocate specs for restored markdown-viewer tabs on workspace-connect,
  // reading the layout held by the LayoutStore adapter (see mime.view.pdf).
  register(
    workspace.onLoad(() => {
      restorePanelSpecsFromLayout({
        store,
        layout: layoutStore.get(),
        panelIdPrefix: "markdown-viewer:",
        catalogId: MARKDOWN_VIEWER_CATALOG_ID,
        buildSpec: (uri) => makeMarkdownSpec(uri),
        buildSpecId: (uri) => markdownViewerSpecId(uri),
      });
    }),
  );

  const { registry } = defineRegistry(markdownViewerCatalog, {
    components: {
      MarkdownView: ({ props }) => <MarkdownView uri={props.uri} />,
    },
    actions: {},
  });
  register(slots.register(catalogsSlot, MARKDOWN_VIEWER_CATALOG_ID, registry));

  register(
    slots.provide(mimeRenderersSlot, {
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

  register(slots.provide(dockTabIconSlot, { panelIdPrefix: "markdown-viewer:", Icon: FileText }));

  return cleanup;
}
