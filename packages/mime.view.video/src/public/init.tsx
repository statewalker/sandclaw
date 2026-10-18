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
import { FileVideo } from "lucide-react";
import { VideoView } from "../internal/video-view.js";
import {
  makeVideoSpec,
  VIDEO_VIEWER_CATALOG_ID,
  videoViewerCatalog,
  videoViewerPanelId,
  videoViewerSpecId,
} from "./catalog.js";

export default function initVideoViewerReact(ctx: Record<string, unknown>): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);
  const store = workspace.requireAdapter(SpecStore);
  const layoutStore = workspace.requireAdapter(LayoutStore);

  // Pre-allocate specs for restored video-viewer tabs on workspace-connect,
  // reading the layout held by the LayoutStore adapter (see mime.view.pdf).
  register(
    workspace.onLoad(() => {
      restorePanelSpecsFromLayout({
        store,
        layout: layoutStore.get(),
        panelIdPrefix: "video-viewer:",
        catalogId: VIDEO_VIEWER_CATALOG_ID,
        buildSpec: (uri) => makeVideoSpec(uri),
        buildSpecId: (uri) => videoViewerSpecId(uri),
      });
    }),
  );

  const { registry } = defineRegistry(videoViewerCatalog, {
    components: {
      VideoView: ({ props }) => <VideoView uri={props.uri} />,
    },
    actions: {},
  });
  register(slots.register(catalogsSlot, VIDEO_VIEWER_CATALOG_ID, registry));

  register(
    slots.provide(mimeRenderersSlot, {
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

  register(slots.provide(dockTabIconSlot, { panelIdPrefix: "video-viewer:", Icon: FileVideo }));

  return cleanup;
}
