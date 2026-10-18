import { catalogsSlot } from "@statewalker/render.core";
import { defineRegistry } from "@statewalker/render.view.react";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { WEBAPP_DOCK_CATALOG_ID } from "@statewalker/webapp.browser";
import { getWorkspace } from "@statewalker/workspace.core";
import { siteFrameCatalog } from "./catalog.js";
import { SiteFrame } from "./site-frame.js";

/**
 * Renderer-fragment init for the web-app dock view (ADR-0002). Binds the `SiteFrame`
 * catalog component to the React `<SiteFrame>` and registers the resolved registry into the
 * shell's `json:catalogs` slot under `WEBAPP_DOCK_CATALOG_ID`, so the shell's `JsonPanel`
 * renders the hosted client inside the dock tab. Mirrors chat-mini.chat-react's catalog
 * registration; the open-command logic lives separately in `webapp.browser`.
 */
export default function initWebAppViews(ctx: Record<string, unknown>): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);

  const { registry } = defineRegistry(siteFrameCatalog, {
    components: {
      SiteFrame: ({ props }) => (
        <SiteFrame baseUrl={props.baseUrl} clientEntry={props.clientEntry} />
      ),
    },
    actions: {},
  });
  register(slots.register(catalogsSlot, WEBAPP_DOCK_CATALOG_ID, registry));

  return cleanup;
}
