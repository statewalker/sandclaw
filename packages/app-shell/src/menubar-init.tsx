import {
  type AppContext,
  defineAction,
  getCommands,
  getSlots,
  handleCommand,
  provideAction,
  provideView,
} from "@statewalker/kernel.core";
import { OpenSettingsCommand } from "@statewalker/settings.core";
import { newRegistry } from "@statewalker/shared-registry";
import { dockHeaderItemsSlot } from "@statewalker/shell.core";
import { ChangeWorkspaceCommand, WorkspaceDisconnectCommand } from "@statewalker/workspace.browser";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { SwitchWorkspaceCommand } from "./extension-points.js";
import { Menubar } from "./menubar.js";
import { ThemeToggle } from "./theme-toggle.js";

const MENUBAR_VIEW_KEY = "app-shell:menubar";
const THEME_TOGGLE_VIEW_KEY = "app-shell:theme-toggle";

/**
 * Renderer-fragment init that wires the leading-header menu bar and the
 * trailing-header theme toggle, answers `app-shell:switch-workspace`, and
 * contributes the two actions every shell needs (Settings, Switch workspace)
 * under the System menu. Downstream fragments contribute their own menus
 * with `provideAction`.
 */
export function initMenubar(ctx: AppContext): () => Promise<void> {
  const slots = getSlots(ctx);
  const commands = getCommands(ctx);
  const [register, cleanup] = newRegistry();

  register(provideView(ctx, MENUBAR_VIEW_KEY, Menubar));
  register(provideView(ctx, THEME_TOGGLE_VIEW_KEY, ThemeToggle));

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
    handleCommand(ctx, SwitchWorkspaceCommand, async () => {
      await commands.call(WorkspaceDisconnectCommand, {}).promise;
      try {
        await commands.call(ChangeWorkspaceCommand, {}).promise;
      } catch (e) {
        // User cancellation throws AbortError; user already in `empty`.
        if (e instanceof DOMException && e.name === "AbortError") return;
        throw e;
      }
    }),
  );

  register(
    provideAction(
      ctx,
      defineAction(
        OpenSettingsCommand,
        {},
        {
          id: "app-shell:settings",
          menu: "System",
          order: 100,
          label: "Settings",
          icon: SettingsIcon,
        },
      ),
    ),
  );
  register(
    provideAction(
      ctx,
      defineAction(
        SwitchWorkspaceCommand,
        {},
        {
          id: "app-shell:switch-workspace",
          menu: "System",
          order: 900,
          label: "Switch workspace",
          icon: LogOut,
        },
      ),
    ),
  );

  return cleanup;
}
