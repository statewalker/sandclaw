import { newSlot } from "@statewalker/shared-slots";
import type { ComponentType } from "react";

/**
 * `app-shell:system-menu-items` — entries for the trailing-header
 * System dropdown.
 *
 * Each contributor produces an `{id, label, Icon, onActivate}` value;
 * `app-shell` renders them as a single ordered list. The shell itself
 * contributes Settings and Switch-workspace; downstream fragments
 * (file-explorer's "New file panel", future global actions, …)
 * contribute their own entries here so they appear in the same place
 * without app-shell having to depend on them.
 */
export interface SystemMenuItem {
  /** Stable id; doubles as React key. */
  id: string;
  /** Lower wins; defaults to 100. */
  order?: number;
  /** Visible label, e.g. `"Settings"`. */
  label: string;
  /** Lucide-style icon component (must accept `className`). */
  Icon: ComponentType<{ className?: string }>;
  /**
   * Fired when the user activates the item. The menu auto-closes
   * before the callback runs; cleanup (e.g. dispatching an intent)
   * is the contributor's responsibility.
   */
  onActivate: () => void | Promise<void>;
}

export const [provideSystemMenuItem, observeSystemMenuItems] =
  newSlot<SystemMenuItem>("app-shell:system-menu-items");
