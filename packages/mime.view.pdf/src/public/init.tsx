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
import { PdfView } from "../internal/pdf-view.js";
import {
  makePdfSpec,
  PDF_VIEWER_CATALOG_ID,
  pdfViewerCatalog,
  pdfViewerPanelId,
  pdfViewerSpecId,
} from "./catalog.js";

export default function initPdfViewerReact(ctx: Record<string, unknown>): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);
  const store = workspace.requireAdapter(SpecStore);
  const layoutStore = workspace.requireAdapter(LayoutStore);

  // On workspace-connect, pre-allocate specs for any pdf-viewer tabs in the
  // restored dock layout (held by the LayoutStore adapter) so DockHost's
  // deferred fromJSON() finds a spec instead of the PanelMissing placeholder.
  register(
    workspace.onLoad(() => {
      restorePanelSpecsFromLayout({
        store,
        layout: layoutStore.get(),
        panelIdPrefix: "pdf-viewer:",
        catalogId: PDF_VIEWER_CATALOG_ID,
        buildSpec: (uri) => makePdfSpec(uri),
        buildSpecId: (uri) => pdfViewerSpecId(uri),
      });
    }),
  );

  const { registry } = defineRegistry(pdfViewerCatalog, {
    components: {
      PdfView: ({ props }) => <PdfView uri={props.uri} />,
    },
    actions: {},
  });
  register(slots.register(catalogsSlot, PDF_VIEWER_CATALOG_ID, registry));

  register(
    slots.provide(mimeRenderersSlot, {
      mimeTypePattern: "application/pdf",
      buildPanel(uri) {
        return {
          catalogId: PDF_VIEWER_CATALOG_ID,
          spec: makePdfSpec(uri),
          panelId: pdfViewerPanelId(uri),
          specId: pdfViewerSpecId(uri),
        };
      },
    }),
  );

  register(slots.provide(dockTabIconSlot, { panelIdPrefix: "pdf-viewer:", Icon: FileText }));

  return cleanup;
}
