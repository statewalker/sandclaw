import { newViewRegistry, type ViewComponent } from "@statewalker/core-react";
import { provideDockHeaderItem } from "@statewalker/dock";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace-api";
import { SystemMenu } from "./system-menu.js";

const SYSTEM_MENU_VIEW_KEY = "app-shell:system-menu";

/**
 * Renderer-fragment init that registers the canonical System menu
 * into the trailing header slot. Replaces the per-feature Settings and
 * Switch-workspace buttons that the substrate fragments used to
 * contribute individually.
 */
export function initSystemMenu(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const views = newViewRegistry(workspace);
  const slots = workspace.requireAdapter(Slots);

  const [register, cleanup] = newRegistry();

  register(views.register(SYSTEM_MENU_VIEW_KEY, SystemMenu as ViewComponent));
  register(
    provideDockHeaderItem(slots, {
      id: "app-shell:system-menu",
      slot: "trailing",
      order: 1000,
      viewKey: SYSTEM_MENU_VIEW_KEY,
    }),
  );

  return cleanup;
}
