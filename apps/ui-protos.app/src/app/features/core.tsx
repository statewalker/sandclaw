import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@statewalker/ui.view.shadcn";
import { Info, Keyboard, Settings } from "lucide-react";
import { useContext } from "react";
import { Appearance } from "../../settings/appearance.js";
import {
  ApplyLayout,
  menuItem,
  menuItemsSlot,
  OpenSettings,
  overlaysSlot,
  SetTheme,
  ShowAbout,
  ShowShortcuts,
} from "../contracts.js";
import {
  all,
  createStore,
  type Feature,
  handle,
  provideAll,
  settingsTab,
  ThemeContext,
  useAppRuntime,
  useSlotValues,
  useStore,
} from "../runtime.js";

function AppearanceTab() {
  const { commands } = useAppRuntime();
  const theme = useContext(ThemeContext);
  return (
    <Appearance
      value={{ theme, textSize: "default", density: "comfortable" }}
      onChange={(v) => {
        commands.call(SetTheme, { theme: v.theme });
      }}
    />
  );
}

/** Help › Keyboard shortcuts: every menu item that has one, from the menu-items slot. */
function Shortcuts() {
  const items = useSlotValues(menuItemsSlot).filter((i) => i.shortcut);
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
      {items.map((i) => (
        <div key={i.id} className="contents">
          <dt>
            {i.menu} › {i.label}
          </dt>
          <dd className="text-muted-foreground font-mono text-xs">{i.shortcut}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Layouts, theme, Settings…, Appearance, and Help. */
export const core: Feature = {
  id: "core",
  label: "Core",
  contribute(rt) {
    const dialog = createStore<"shortcuts" | "about" | null>(null);
    function HelpDialogs() {
      const open = useStore(dialog);
      return (
        <Dialog open={open !== null} onOpenChange={(o) => !o && dialog.set(null)}>
          <DialogContent>
            <DialogTitle>{open === "about" ? "About Sandclaw" : "Keyboard shortcuts"}</DialogTitle>
            <DialogDescription>
              {open === "about"
                ? "An assistant over your folder, shared with your group. Prototype build."
                : "The keys that run menu commands."}
            </DialogDescription>
            {open === "shortcuts" && <Shortcuts />}
          </DialogContent>
        </Dialog>
      );
    }
    return all(
      provideAll(rt.slots, menuItemsSlot, [
        menuItem(
          OpenSettings,
          {},
          {
            id: "file.settings",
            menu: "File",
            order: 80,
            label: "Settings…",
            Icon: Settings,
            shortcut: "Ctrl+,",
          },
        ),
        menuItem(
          ApplyLayout,
          { id: "assistant" },
          {
            id: "view.layout.assistant",
            menu: "View",
            order: 80,
            submenu: "Layout",
            label: "Assistant",
          },
        ),
        menuItem(
          ApplyLayout,
          { id: "reading" },
          {
            id: "view.layout.reading",
            menu: "View",
            order: 81,
            submenu: "Layout",
            label: "Reading",
          },
        ),
        menuItem(
          SetTheme,
          { theme: "light" },
          { id: "view.theme.light", menu: "View", order: 90, submenu: "Theme", label: "Light" },
        ),
        menuItem(
          SetTheme,
          { theme: "dark" },
          { id: "view.theme.dark", menu: "View", order: 91, submenu: "Theme", label: "Dark" },
        ),
        menuItem(
          SetTheme,
          { theme: "system" },
          { id: "view.theme.system", menu: "View", order: 92, submenu: "Theme", label: "System" },
        ),
        menuItem(ShowShortcuts, undefined, {
          id: "help.shortcuts",
          menu: "Help",
          order: 10,
          label: "Keyboard shortcuts",
          Icon: Keyboard,
        }),
        menuItem(ShowAbout, undefined, {
          id: "help.about",
          menu: "Help",
          order: 20,
          label: "About Sandclaw",
          Icon: Info,
        }),
      ]),
      settingsTab(rt.slots, "appearance", 20, () => <AppearanceTab />),
      handle(rt, ShowShortcuts, () => dialog.set("shortcuts")),
      handle(rt, ShowAbout, () => dialog.set("about")),
      rt.slots.provide(overlaysSlot, { id: "help-dialogs", Component: HelpDialogs }),
    );
  },
};
