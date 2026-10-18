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
import { FileImage } from "lucide-react";
import { ImageView } from "../internal/image-view.js";
import {
  IMAGE_VIEWER_CATALOG_ID,
  imageViewerCatalog,
  imageViewerPanelId,
  imageViewerSpecId,
  makeImageSpec,
} from "./catalog.js";

export default function initImageViewerReact(ctx: Record<string, unknown>): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);
  const store = workspace.requireAdapter(SpecStore);
  const layoutStore = workspace.requireAdapter(LayoutStore);

  // Pre-allocate specs for restored image-viewer tabs on workspace-connect,
  // reading the layout held by the LayoutStore adapter (see mime.view.pdf).
  register(
    workspace.onLoad(() => {
      restorePanelSpecsFromLayout({
        store,
        layout: layoutStore.get(),
        panelIdPrefix: "image-viewer:",
        catalogId: IMAGE_VIEWER_CATALOG_ID,
        buildSpec: (uri) => makeImageSpec(uri),
        buildSpecId: (uri) => imageViewerSpecId(uri),
      });
    }),
  );

  const { registry } = defineRegistry(imageViewerCatalog, {
    components: {
      ImageView: ({ props }) => <ImageView uri={props.uri} />,
    },
    actions: {},
  });
  register(slots.register(catalogsSlot, IMAGE_VIEWER_CATALOG_ID, registry));

  register(
    slots.provide(mimeRenderersSlot, {
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

  register(slots.provide(dockTabIconSlot, { panelIdPrefix: "image-viewer:", Icon: FileImage }));

  return cleanup;
}
