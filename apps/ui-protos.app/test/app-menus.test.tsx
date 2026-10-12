import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplyLayout, menuItem, OpenSettings } from "../src/app/contracts.js";
import { buildMenus, isTyping, matchesShortcut } from "../src/app/shell/menu-model.js";
import { AppMenubar } from "../src/app/shell/menubar.js";
import { PhoneMenu } from "../src/app/shell/phone-menu.js";

afterEach(cleanup);

const items = [
  menuItem(
    OpenSettings,
    {},
    { id: "settings", menu: "File", order: 80, label: "Settings…", shortcut: "Ctrl+," },
  ),
  menuItem(
    ApplyLayout,
    { id: "reading" },
    { id: "reading", menu: "View", order: 80, submenu: "Layout", label: "Reading" },
  ),
  menuItem(
    ApplyLayout,
    { id: "assistant" },
    { id: "assistant", menu: "View", order: 79, submenu: "Layout", label: "Assistant" },
  ),
  menuItem(
    OpenSettings,
    { section: "storages" },
    { id: "storages", menu: "File", order: 75, label: "Storages…" },
  ),
  menuItem(OpenSettings, { section: "me" }, { id: "me", menu: "Help", label: "About" }),
];

const key = (init: KeyboardEventInit, target?: EventTarget) => {
  const e = new KeyboardEvent("keydown", init);
  if (target) Object.defineProperty(e, "target", { value: target });
  return e;
};

describe("menu model", () => {
  it("menus follow the fixed order; items their order; a submenu sits where its first item would", () => {
    const menus = buildMenus(items);
    expect(menus.map((m) => m.name)).toEqual(["File", "View", "Help"]);
    expect(menus[0]?.entries.map((e) => (e.kind === "item" ? e.item.label : e.label))).toEqual([
      "Storages…",
      "Settings…",
    ]);
    const view = menus[1]?.entries;
    expect(view).toHaveLength(1);
    expect(view?.[0]?.kind === "submenu" && view[0].items.map((i) => i.label)).toEqual([
      "Assistant",
      "Reading",
    ]);
  });

  it("shortcuts match Ctrl or Cmd, exact modifiers, and key names", () => {
    expect(matchesShortcut("Ctrl+,", key({ key: ",", ctrlKey: true }))).toBe(true);
    expect(matchesShortcut("Ctrl+,", key({ key: ",", metaKey: true }))).toBe(true);
    expect(matchesShortcut("Ctrl+,", key({ key: "," }))).toBe(false);
    expect(matchesShortcut("F5", key({ key: "F5", ctrlKey: true }))).toBe(false);
    expect(matchesShortcut("Del", key({ key: "Delete" }))).toBe(true);
  });

  it("a plain key in a text field is typing; with Ctrl it is a shortcut", () => {
    const input = document.createElement("input");
    expect(isTyping(key({ key: "Delete" }, input))).toBe(true);
    expect(isTyping(key({ key: ",", ctrlKey: true }, input))).toBe(false);
    expect(isTyping(key({ key: "Delete" }, document.body))).toBe(false);
  });
});

describe("AppMenubar", () => {
  it("opens a menu and runs the chosen item, its shortcut shown beside it", () => {
    const onRun = vi.fn();
    render(<AppMenubar menus={buildMenus(items)} onRun={onRun} />);
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "File" }), { key: "Enter" });
    const settings = screen.getByRole("menuitem", { name: /^Settings…/ });
    expect(settings.textContent).toContain("Ctrl+,");
    fireEvent.click(settings);
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: "settings" }));
  });
});

describe("PhoneMenu", () => {
  it("walks menus and submenus as pages, with Back, and runs the item", () => {
    const onRun = vi.fn();
    render(<PhoneMenu menus={buildMenus(items)} onRun={onRun} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const sheet = screen.getByRole("dialog", { name: "Menu" });
    fireEvent.click(within(sheet).getByRole("button", { name: "View" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Layout" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Back" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Layout" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Reading" }));
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: "reading" }));
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
  });
});
