import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace-api";
import { ViewRegistry } from "@/fragments/core-views";
import { provideDockHeaderItem, provideDockOverlay } from "@/fragments/dock";
import { SettingsButton } from "../internal/settings-button.js";
import { SettingsDialog } from "../internal/settings-dialog.js";

const VIEW_KEY_BUTTON = "settings:button";
const VIEW_KEY_DIALOG = "settings:dialog";

/**
 * Renderer-fragment init for `settings-views`. Registers the
 * settings button into `ViewRegistry` and contributes it to
 * `dock:header-items` (`trailing` slot); registers the settings
 * dialog into `ViewRegistry` and contributes it to `dock:overlays`.
 */
export default function initSettingsViews(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const views = workspace.requireAdapter(ViewRegistry);
  const slots = workspace.requireAdapter(Slots);

  register(
    views.register(
      VIEW_KEY_BUTTON,
      SettingsButton as unknown as Parameters<typeof views.register>[1],
    ),
  );
  register(
    views.register(
      VIEW_KEY_DIALOG,
      SettingsDialog as unknown as Parameters<typeof views.register>[1],
    ),
  );
  register(
    provideDockHeaderItem(slots, {
      id: "settings:button",
      slot: "trailing",
      order: 50,
      viewKey: VIEW_KEY_BUTTON,
    }),
  );
  register(
    provideDockOverlay(slots, {
      id: "settings:dialog",
      viewKey: VIEW_KEY_DIALOG,
    }),
  );

  return cleanup;
}
