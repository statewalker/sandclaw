import { Command, passthrough } from "@statewalker/shared-commands";
import { defineSlot } from "@statewalker/shared-slots";
import type { ComponentType } from "react";

/**
 * `app-shell:menubar-items` — entries for the leading-header menu bar.
 *
 * Prefer contributing a kernel action (`provideAction` from
 * `@statewalker/kernel.core`) with a `menu`: it names a command instead of
 * carrying a closure, so menus, palettes and tools share one declaration.
 * This slot stays for items that are not a single command call.
 *
 * Each contribution becomes a row inside a top-level dropdown grouped
 * by its `menu` label (e.g. "Files", "System"). The menubar component
 * renders one dropdown per distinct `menu`, ordered by the minimum
 * `order` of its items. The shell itself contributes the System menu
 * (Settings + Switch-workspace); downstream fragments contribute their
 * own menus / items without app-shell having to depend on them
 * (file-explorer's "New file panel" lands under the Files menu, etc.).
 */
export interface MenubarItem {
  /** Stable id; doubles as React key. */
  id: string;
  /**
   * Top-level menu this item belongs to. Items sharing a `menu` label
   * collapse into the same dropdown. Casing matters — it's the
   * user-visible button label.
   */
  menu: string;
  /** Lower wins; defaults to 100. Also drives menu position via min(order). */
  order?: number;
  /** Visible label, e.g. `"Settings"`. */
  label: string;
  /** Lucide-style icon component (must accept `className`). */
  Icon: ComponentType<{ className?: string }>;
  /**
   * Fired when the user activates the item. The dropdown auto-closes
   * before the callback runs; cleanup (e.g. dispatching an command) is
   * the contributor's responsibility.
   */
  onActivate: () => void | Promise<void>;
}

export const menubarItemsSlot = defineSlot<MenubarItem>("app-shell:menubar-items");

/**
 * `app-shell:switch-workspace` — disconnect the current workspace and pick
 * another one. Answered by the menubar fragment; a cancelled picker resolves
 * quietly (the shell is left in its `empty` state).
 */
export const SwitchWorkspaceCommand = Command.async("app-shell:switch-workspace")
  .input(passthrough<Record<string, never>>())
  .output(passthrough<void>())
  .label("Switch workspace")
  .build();
