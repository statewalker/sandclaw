import { coreViewsSlot, type ViewComponent } from "@statewalker/ui.view.react";
import { dockHeaderItemsSlot } from "@statewalker/shell.core";
import { OpenSettingsCommand } from "@statewalker/settings.core";
import { Commands } from "@statewalker/shared-commands";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace";
import {
  ChangeWorkspaceCommand,
  WorkspaceDisconnectCommand,
} from "@statewalker/workspace-bridge";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { menubarItemsSlot } from "./extension-points.js";
import { Menubar } from "./menubar.js";
import { ThemeToggle } from "./theme-toggle.js";

const MENUBAR_VIEW_KEY = "app-shell:menubar";
const THEME_TOGGLE_VIEW_KEY = "app-shell:theme-toggle";

/**
 * Renderer-fragment init that wires the leading-header menu bar and
 * the trailing-header theme toggle, then seeds the two substrate
 * actions every shell needs (Settings, Switch workspace) under the
 * System menu. Downstream fragments contribute their own menus / items
 * via `menubarItemsSlot` — file-explorer's "New file panel" lands
 * under the Files menu, for instance.
 */
export function initMenubar(ctx: Record<string, unknown>): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);
  const commands = workspace.requireAdapter(Commands);

  const [register, cleanup] = newRegistry();

  register(
    slots.register(coreViewsSlot, MENUBAR_VIEW_KEY, Menubar as ViewComponent),
  );
  register(
    slots.register(
      coreViewsSlot,
      THEME_TOGGLE_VIEW_KEY,
      ThemeToggle as ViewComponent,
    ),
  );

  register(
    slots.provide(dockHeaderItemsSlot, {
      id: "app-shell:menubar",
      slot: "leading",
      order: 100,
      viewKey: MENUBAR_VIEW_KEY,
    }),
  );
  register(
    slots.provide(dockHeaderItemsSlot, {
      id: "app-shell:theme-toggle",
      slot: "trailing",
      order: 1000,
      viewKey: THEME_TOGGLE_VIEW_KEY,
    }),
  );

  register(
    slots.provide(menubarItemsSlot, {
      id: "app-shell:settings",
      menu: "System",
      order: 100,
      label: "Settings",
      Icon: SettingsIcon,
      onActivate: () => {
        commands.call(OpenSettingsCommand, {});
      },
    }),
  );
  register(
    slots.provide(menubarItemsSlot, {
      id: "app-shell:switch-workspace",
      menu: "System",
      order: 900,
      label: "Switch workspace",
      Icon: LogOut,
      onActivate: async () => {
        await commands.call(WorkspaceDisconnectCommand, {}).promise;
        try {
          await commands.call(ChangeWorkspaceCommand, {}).promise;
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
