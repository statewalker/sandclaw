import { coreViewsSlot, type ViewComponent } from "@statewalker/core-react";
import { dockHeaderItemsSlot } from "@statewalker/dock";
import { OpenSettingsCommand } from "@statewalker/settings";
import { Commands } from "@statewalker/shared-commands";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace";
import {
  ChangeWorkspaceCommand, WorkspaceDisconnectCommand
} from "@statewalker/workspace-bridge";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { systemMenuItemsSlot } from "./extension-points.js";
import { SystemMenu } from "./system-menu.js";

const SYSTEM_MENU_VIEW_KEY = "app-shell:system-menu";

/**
 * Renderer-fragment init that registers the canonical System menu
 * into the trailing header slot AND seeds it with the two substrate
 * actions every shell needs (Settings, Switch workspace). Downstream
 * fragments contribute more items via `provideSystemMenuItem` —
 * file-explorer-react adds "New file panel", for instance.
 */
export function initSystemMenu(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);
  const intents = workspace.requireAdapter(Commands);

  const [register, cleanup] = newRegistry();

  register(
    slots.register(
      coreViewsSlot,
      SYSTEM_MENU_VIEW_KEY,
      SystemMenu as ViewComponent,
    ),
  );
  register(
    slots.provide(dockHeaderItemsSlot, {
      id: "app-shell:system-menu",
      slot: "trailing",
      order: 1000,
      viewKey: SYSTEM_MENU_VIEW_KEY,
    }),
  );

  register(
    slots.provide(systemMenuItemsSlot, {
      id: "app-shell:settings",
      order: 100,
      label: "Settings",
      Icon: SettingsIcon,
      onActivate: () => {
        intents.call(OpenSettingsCommand, {});
      },
    }),
  );
  register(
    slots.provide(systemMenuItemsSlot, {
      id: "app-shell:switch-workspace",
      order: 900,
      label: "Switch workspace",
      Icon: LogOut,
      onActivate: async () => {
        await intents.call(WorkspaceDisconnectCommand, {}).promise;
        try {
          await intents.call(ChangeWorkspaceCommand, {}).promise;
        } catch (e) {
          // User cancellation throws AbortError; user already in `empty`.
          if (e instanceof DOMException && e.name === "AbortError") return;
          throw e;
        }
      },
    }),
  );

  return cleanup;
}
