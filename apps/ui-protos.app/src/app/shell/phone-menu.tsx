import { Button } from "@statewalker/ui.view.shadcn";
import { ArrowLeft, ChevronRight, Menu as MenuIcon, X } from "lucide-react";
import { useState } from "react";
import type { AppMenuItem, Icon } from "../contracts.js";
import type { Menu } from "./menu-model.js";

function Row({
  label,
  Icon,
  hint,
  more,
  onClick,
}: {
  label: string;
  Icon?: Icon;
  hint?: string;
  more?: boolean;
  onClick(): void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="hover:bg-accent flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm"
      >
        {Icon ? <Icon className="size-4" /> : null}
        <span className="flex-1">{label}</span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
        {more && <ChevronRight className="text-muted-foreground size-4" />}
      </button>
    </li>
  );
}

/**
 * The phone's ☰: the same menus as the menubar, as full-height pages — the
 * menus, a menu's items, a submenu's items — with Back. It covers the App
 * (the App's root is `relative`), not the whole page.
 */
export function PhoneMenu({ menus, onRun }: { menus: Menu[]; onRun(item: AppMenuItem): void }) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<string[]>([]);
  const close = () => {
    setOpen(false);
    setPath([]);
  };
  const pick = (item: AppMenuItem) => {
    close();
    onRun(item);
  };
  const [menuName, subName] = path;
  const menu = menus.find((m) => m.name === menuName);
  const sub = menu?.entries.find((e) => e.kind === "submenu" && e.label === subName);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Menu"
          className="bg-background absolute inset-0 z-50 flex flex-col"
        >
          <div className="flex h-10 shrink-0 items-center gap-1 border-b px-1">
            {path.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setPath(path.slice(0, -1))}>
                <ArrowLeft /> Back
              </Button>
            )}
            <span className="min-w-0 flex-1 truncate px-2 text-sm font-medium">
              {subName ?? menuName ?? "Menu"}
            </span>
            <Button variant="ghost" size="icon" aria-label="Close menu" onClick={close}>
              <X />
            </Button>
          </div>
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
            {!menu
              ? menus.map((m) => (
                  <Row key={m.name} label={m.name} more onClick={() => setPath([m.name])} />
                ))
              : sub?.kind === "submenu"
                ? sub.items.map((item) => (
                    <Row
                      key={item.id}
                      label={item.label}
                      Icon={item.Icon}
                      hint={item.shortcut}
                      onClick={() => pick(item)}
                    />
                  ))
                : menu.entries.map((entry) =>
                    entry.kind === "item" ? (
                      <Row
                        key={entry.item.id}
                        label={entry.item.label}
                        Icon={entry.item.Icon}
                        hint={entry.item.shortcut}
                        onClick={() => pick(entry.item)}
                      />
                    ) : (
                      <Row
                        key={entry.label}
                        label={entry.label}
                        more
                        onClick={() => setPath([menu.name, entry.label])}
                      />
                    ),
                  )}
          </ul>
        </div>
      )}
    </>
  );
}
