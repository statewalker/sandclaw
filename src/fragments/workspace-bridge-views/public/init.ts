import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace-api";
import { ViewRegistry } from "@/fragments/core-views";
import { provideDockHeaderItem } from "@/fragments/dock";
import { SwitchWorkspaceButton } from "../internal/switch-workspace-button.js";
import { WorkspaceLabelHeader } from "../internal/workspace-label-header.js";

const VIEW_KEY_LABEL = "workspace:label-header";
const VIEW_KEY_SWITCH = "workspace:switch-button";

/**
 * Renderer-fragment init for workspace-bridge-views (per ADR 0002).
 * Registers the two header views into `ViewRegistry` and contributes
 * them to `dock:header-items`:
 *   - workspace label (slot `leading`)
 *   - switch-workspace button (slot `trailing`)
 *
 * The `<AppWorkspaceProvider/>` and `<DirectoryPickerEmptyState/>`
 * components are imported directly by `core-views`' `<AppRoot/>` and
 * `<App/>`; they are not registered into any slot.
 */
export default function initWorkspaceBridgeViews(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const views = workspace.requireAdapter(ViewRegistry);
  const slots = workspace.requireAdapter(Slots);

  register(
    views.register(
      VIEW_KEY_LABEL,
      WorkspaceLabelHeader as unknown as Parameters<typeof views.register>[1],
    ),
  );
  register(
    views.register(
      VIEW_KEY_SWITCH,
      SwitchWorkspaceButton as unknown as Parameters<typeof views.register>[1],
    ),
  );
  register(
    provideDockHeaderItem(slots, {
      id: "workspace:label",
      slot: "leading",
      order: 0,
      viewKey: VIEW_KEY_LABEL,
    }),
  );
  register(
    provideDockHeaderItem(slots, {
      id: "workspace:switch",
      slot: "trailing",
      order: 100,
      viewKey: VIEW_KEY_SWITCH,
    }),
  );

  return cleanup;
}
