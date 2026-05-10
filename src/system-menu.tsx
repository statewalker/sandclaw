import {
  compareByOrderAndId,
  useAdapter,
  useSlot,
} from "@statewalker/core-react";
import { Button } from "@statewalker/shadcn-react";
import { Slots } from "@statewalker/shared-slots";
import { ChevronDown } from "lucide-react";
import {
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { observeSystemMenuItems } from "./extension-points.js";

/**
 * Trailing-header dropdown that groups system-level actions.
 *
 * The list of entries is fully slot-driven: every contribution to
 * `app-shell:system-menu-items` becomes a row, ordered by `order`
 * then `id`. The shell itself contributes Settings + Switch-workspace;
 * downstream fragments (file-explorer's "New file panel", any future
 * global action) contribute alongside without app-shell depending on
 * them.
 *
 * Implementation is intentionally low-dep — a controlled `useState`
 * popover with click-outside / Escape-to-close — so `app-shell`
 * doesn't need to pull in a new shadcn / radix primitive.
 */
export function SystemMenu(): ReactElement {
  const slots = useAdapter(Slots);
  const items = useSlot(slots, observeSystemMenuItems);
  const sortedItems = useMemo(
    () => [...items].sort(compareByOrderAndId),
    [items],
  );

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <Button
        size="sm"
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        System
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: container relays clicks to the menu items, which are buttons handling Enter/Space themselves
        <div
          // Reset bubbling clicks from menu items so the document-level
          // pointerdown handler doesn't immediately close on the same gesture.
          onClick={(e: MouseEvent) => e.stopPropagation()}
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[200px] rounded-md border border-border bg-popover p-1 shadow-md z-50"
        >
          {sortedItems.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No actions
            </div>
          )}
          {sortedItems.map((item) => (
            <MenuItem
              key={item.id}
              onClick={() => {
                setOpen(false);
                Promise.resolve(item.onActivate()).catch((err) => {
                  console.error(`[system-menu] item "${item.id}" failed:`, err);
                });
              }}
            >
              <item.Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </MenuItem>
          ))}
        </div>
      )}
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
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
    >
      {children}
    </button>
  );
}
