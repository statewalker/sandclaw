import { ChevronRight } from "lucide-react";
import { Menubar } from "radix-ui";
import { useEffect, useRef } from "react";
import type { AppMenuItem } from "../contracts.js";
import type { Menu } from "./menu-model.js";

/** Shared by the menubar and the avatar menu. */
export const menuContentClass =
  "bg-popover text-popover-foreground z-50 min-w-48 rounded-md border p-1 shadow-md";
export const menuRowClass =
  "data-[highlighted]:bg-accent flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none";

function Entry({ item, onRun }: { item: AppMenuItem; onRun(item: AppMenuItem): void }) {
  const Icon = item.Icon;
  return (
    <Menubar.Item className={menuRowClass} onSelect={() => onRun(item)}>
      {Icon ? <Icon className="size-4" /> : <span className="size-4" />}
      <span className="flex-1">{item.label}</span>
      {item.shortcut && <span className="text-muted-foreground ml-6 text-xs">{item.shortcut}</span>}
    </Menubar.Item>
  );
}

/**
 * The App's menus (Radix Menubar: arrows move between menus and items, Escape
 * closes). F10 focuses the first menu, as in Theia.
 */
export function AppMenubar({ menus, onRun }: { menus: Menu[]; onRun(item: AppMenuItem): void }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F10" || e.defaultPrevented) return;
      e.preventDefault();
      bar.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Menubar.Root ref={bar} aria-label="Main menu" className="flex items-center gap-0.5">
      {menus.map((menu) => (
        <Menubar.Menu key={menu.name}>
          <Menubar.Trigger className="hover:bg-accent focus:bg-accent data-[state=open]:bg-accent rounded-sm px-2 py-1 text-sm outline-none select-none">
            {menu.name}
          </Menubar.Trigger>
          <Menubar.Portal>
            <Menubar.Content align="start" sideOffset={4} className={menuContentClass}>
              {menu.entries.map((entry) =>
                entry.kind === "item" ? (
                  <Entry key={entry.item.id} item={entry.item} onRun={onRun} />
                ) : (
                  <Menubar.Sub key={entry.label}>
                    <Menubar.SubTrigger className={menuRowClass}>
                      <span className="size-4" />
                      <span className="flex-1">{entry.label}</span>
                      <ChevronRight className="size-4" />
                    </Menubar.SubTrigger>
                    <Menubar.Portal>
                      <Menubar.SubContent className={menuContentClass}>
                        {entry.items.map((item) => (
                          <Entry key={item.id} item={item} onRun={onRun} />
                        ))}
                      </Menubar.SubContent>
                    </Menubar.Portal>
                  </Menubar.Sub>
                ),
              )}
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
      ))}
    </Menubar.Root>
  );
}
