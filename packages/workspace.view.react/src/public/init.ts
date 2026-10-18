import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { dockHeaderItemsSlot } from "@statewalker/shell.core";
import { coreViewsSlot, type ViewComponent } from "@statewalker/ui.view.react";
import { getWorkspace } from "@statewalker/workspace.core";
import { SwitchWorkspaceButton } from "../internal/switch-workspace-button.js";
import { WorkspaceLabelHeader } from "../internal/workspace-label-header.js";

const VIEW_KEY_LABEL = "workspace:label-header";
const VIEW_KEY_SWITCH = "workspace:switch-button";

/**
 * Renderer-fragment init for workspace-bridge-react (per ADR 0002).
 * Registers the two header views into the `core:views` slot and
 * contributes them to `dock:header-items`:
 *   - workspace label (slot `leading`)
 *   - switch-workspace button (slot `trailing`)
 *
 * The `<AppWorkspaceProvider/>` and `<DirectoryPickerEmptyState/>`
 * components are imported directly by `core-react`'s `<AppRoot/>` and
 * `<App/>`; they are not registered into any slot.
 */
export default function initWorkspaceBridgeReact(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);

  register(
    slots.register(coreViewsSlot, VIEW_KEY_LABEL, WorkspaceLabelHeader as unknown as ViewComponent),
  );
  register(
    slots.register(
      coreViewsSlot,
      VIEW_KEY_SWITCH,
      SwitchWorkspaceButton as unknown as ViewComponent,
    ),
  );
  register(
    slots.provide(dockHeaderItemsSlot, {
      id: "workspace:label",
      slot: "leading",
      order: 0,
      viewKey: VIEW_KEY_LABEL,
    }),
  );
  // The Switch-workspace button view is registered above so callers
  // can mount it standalone, but the canonical shell composes it into
  // the System menu — no `dock:header-items` contribution from here.

  return cleanup;
}
