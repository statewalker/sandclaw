import { defineSlot } from "@statewalker/shared-slots";
import type { ComponentType } from "react";

/**
 * `app-shell:menubar-items` — entries for the leading-header menu bar.
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
   * before the callback runs; cleanup (e.g. dispatching an intent) is
   * the contributor's responsibility.
   */
  onActivate: () => void | Promise<void>;
}

export const menubarItemsSlot = defineSlot<MenubarItem>(
  "app-shell:menubar-items",
);
