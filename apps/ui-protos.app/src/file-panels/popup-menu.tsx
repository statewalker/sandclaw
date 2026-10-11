import { cn } from "@statewalker/ui.view.shadcn";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

export interface MenuItem {
  label: string;
  hint?: string;
  onSelect(): void;
  disabled?: boolean;
  /** Marks the item that is the current place (`aria-current`). */
  current?: boolean;
}

const ITEM = "[role=menuitem]:not(:disabled)";

/**
 * The list of a menu: focuses the first item, arrow keys move between items,
 * Escape and a click outside close it. `onClose(refocus)` tells the owner
 * whether focus should go back to what opened the menu.
 */
export function MenuList({
  items,
  onClose,
  className,
  style,
}: {
  items: MenuItem[];
  onClose(refocus: boolean): void;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Callers pass a new function each render; the effect must run once per open.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(ITEM)?.focus();
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close.current(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    const nodes = [...(ref.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])];
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (step) nodes[(at + step + nodes.length) % nodes.length]?.focus();
    else if (e.key === "Escape") onClose(true);
    else if (e.key === "Tab") onClose(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={ref}
      role="menu"
      style={style}
      onKeyDown={onKeyDown}
      className={cn(
        "z-50 max-h-64 min-w-40 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        className,
      )}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          aria-current={item.current ? "true" : undefined}
          onClick={() => {
            onClose(true);
            item.onSelect();
          }}
          className={cn(
            "flex w-full items-center justify-between gap-4 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus:bg-accent disabled:pointer-events-none disabled:opacity-50",
            item.current && "font-medium",
          )}
        >
          <span className="min-w-0 truncate">{item.label}</span>
          {item.hint ? <span className="text-xs text-muted-foreground">{item.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

/**
 * A button that opens a list below it. `items` may be a function: it is
 * awaited on each open, so the list is complete when it appears.
 */
export function PopupMenu({
  label,
  trigger,
  items,
}: {
  label: string;
  trigger: ReactNode;
  items: MenuItem[] | (() => Promise<MenuItem[]>);
}) {
  const [shown, setShown] = useState<MenuItem[] | undefined>();
  const button = useRef<HTMLButtonElement>(null);

  const close = (refocus: boolean) => {
    setShown(undefined);
    if (refocus) button.current?.focus();
  };

  return (
    <span className="relative inline-block">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={shown !== undefined}
        onClick={async () => {
          if (shown) return close(false);
          setShown(typeof items === "function" ? await items() : items);
        }}
        className="inline-flex h-7 items-center rounded-sm px-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        {trigger}
      </button>
      {shown ? (
        <MenuList items={shown} onClose={close} className="absolute top-full left-0 mt-1" />
      ) : null}
    </span>
  );
}
