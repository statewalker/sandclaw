import { type AppMenuItem, MENUS, type MenuName } from "../contracts.js";

export type MenuEntry =
  | { kind: "item"; item: AppMenuItem }
  | { kind: "submenu"; label: string; items: AppMenuItem[] };

export interface Menu {
  name: MenuName;
  entries: MenuEntry[];
}

const byOrder = (a: AppMenuItem, b: AppMenuItem) =>
  (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id);

/**
 * The menus to show: in the fixed `MENUS` order, empty ones left out; items by
 * order; a submenu where its first item would be, holding its items in order.
 */
export function buildMenus(items: readonly AppMenuItem[]): Menu[] {
  return MENUS.flatMap((name): Menu[] => {
    const own = items.filter((i) => i.menu === name).sort(byOrder);
    if (own.length === 0) return [];
    const entries: MenuEntry[] = [];
    for (const item of own) {
      if (!item.submenu) {
        entries.push({ kind: "item", item });
        continue;
      }
      const sub = entries.find(
        (e): e is Extract<MenuEntry, { kind: "submenu" }> =>
          e.kind === "submenu" && e.label === item.submenu,
      );
      if (sub) sub.items.push(item);
      else entries.push({ kind: "submenu", label: item.submenu, items: [item] });
    }
    return [{ name, entries }];
  });
}

/** Short names in shortcuts for the browser's key names. */
const KEY_NAMES: Record<string, string> = { Del: "Delete" };

/** "Ctrl+," against a key press: Ctrl is Ctrl or Cmd; the other modifiers must match exactly. */
export function matchesShortcut(shortcut: string, e: KeyboardEvent): boolean {
  const parts = shortcut.split("+");
  const key = parts.pop() ?? "";
  return (
    (e.ctrlKey || e.metaKey) === parts.includes("Ctrl") &&
    e.shiftKey === parts.includes("Shift") &&
    e.altKey === parts.includes("Alt") &&
    e.key.toLowerCase() === (KEY_NAMES[key] ?? key).toLowerCase()
  );
}

/** A key typed into a text field belongs to the field, unless it carries Ctrl, Cmd or Alt. */
export function isTyping(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const target = e.target;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}
