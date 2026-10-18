import { type Action, actionsSlot } from "@statewalker/kernel.core";
import { Commands } from "@statewalker/shared-commands";
import { Slots } from "@statewalker/shared-slots";
import { compareByOrderAndId, useAdapter, useSlot } from "@statewalker/ui.view.react";
import { Button } from "@statewalker/ui.view.shadcn";
import { ChevronDown } from "lucide-react";
import {
  type ComponentType,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type MenubarItem, menubarItemsSlot } from "./extension-points.js";

/**
 * Leading-header menu bar. Reads the kernel's `kernel:actions` (those with a
 * `menu`) and the legacy `app-shell:menubar-items`, groups entries by their
 * `menu` label, and renders one dropdown per group. Activating an action
 * calls its command with its payload.
 *
 * Top-level menus are ordered by the minimum `order` of items in each
 * group (so a Files menu can be placed left of System by giving its
 * items a lower order). Items within a menu sort by `(order, id)`.
 *
 * Behavior follows standard desktop menubar conventions:
 *   - click a menu name → toggle its dropdown
 *   - while any menu is open, hovering another menu name switches to it
 *   - click outside / Escape → close
 *
 * Implementation is intentionally low-dep — controlled state, no radix
 * / shadcn primitive — so `app-shell` doesn't grow its dep surface.
 */
export function Menubar(): ReactElement {
  const slots = useAdapter(Slots);
  const commands = useAdapter(Commands);
  const items = useSlot(slots, menubarItemsSlot);
  const actions = useSlot(slots, actionsSlot);

  const groups = useMemo(
    () =>
      groupByMenu([
        ...items,
        ...actions.flatMap((action) => (action.menu ? [fromAction(action, commands)] : [])),
      ]),
    [items, actions, commands],
  );

  const [open, setOpen] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open === null) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="flex items-center">
      {groups.map(([menu, menuItems]) => (
        <div key={menu} className="relative">
          <Button
            size="sm"
            variant="ghost"
            aria-haspopup="menu"
            aria-expanded={open === menu}
            onClick={() => setOpen((cur) => (cur === menu ? null : menu))}
            onPointerEnter={() => {
              // Hover-switch only when another menu is already open —
              // never auto-open on hover from a closed state.
              if (open !== null && open !== menu) setOpen(menu);
            }}
          >
            {menu}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {open === menu && (
            // biome-ignore lint/a11y/useKeyWithClickEvents: container relays clicks to the menu items, which are buttons handling Enter/Space themselves
            <div
              onClick={(e: MouseEvent) => e.stopPropagation()}
              role="menu"
              className="absolute left-0 top-full mt-1 min-w-[200px] rounded-md border border-border bg-popover p-1 shadow-md z-50"
            >
              {menuItems.map((item) => (
                <MenuItem
                  key={item.id}
                  onClick={() => {
                    setOpen(null);
                    Promise.resolve(item.onActivate()).catch((err) => {
                      console.error(`[menubar] item "${item.id}" failed:`, err);
                    });
                  }}
                >
                  {item.Icon ? (
                    <item.Icon className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <span className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{item.label}</span>
                </MenuItem>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 whitespace-nowrap rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
    >
      {children}
    </button>
  );
}

/** A menubar row: a legacy item, or an action turned into one. */
type MenuEntry = Omit<MenubarItem, "Icon"> & { Icon?: MenubarItem["Icon"] };

function fromAction(action: Action, commands: Commands): MenuEntry {
  return {
    id: action.id,
    menu: action.menu ?? "",
    order: action.order,
    label: action.label,
    Icon: action.icon as ComponentType<{ className?: string }> | undefined,
    onActivate: async () => {
      await commands.call(action.command, action.payload).promise;
    },
  };
}

function groupByMenu(items: readonly MenuEntry[]): Array<[string, MenuEntry[]]> {
  const byMenu = new Map<string, MenuEntry[]>();
  for (const item of items) {
    const bucket = byMenu.get(item.menu);
    if (bucket) bucket.push(item);
    else byMenu.set(item.menu, [item]);
  }
  for (const bucket of byMenu.values()) {
    bucket.sort(compareByOrderAndId);
  }
  // Order menus by the minimum `order` of their items (lowest wins).
  // Ties break alphabetically on the menu label for determinism.
  return [...byMenu.entries()].sort(([menuA, itemsA], [menuB, itemsB]) => {
    const minA = minOrder(itemsA);
    const minB = minOrder(itemsB);
    if (minA !== minB) return minA - minB;
    return menuA.localeCompare(menuB);
  });
}

function minOrder(items: readonly MenuEntry[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const o = item.order ?? 100;
    if (o < min) min = o;
  }
  return Number.isFinite(min) ? min : 100;
}
