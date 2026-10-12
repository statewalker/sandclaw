// Every slot and command of the App, in one place: features contribute to the
// slots and handle commands; the shell renders the slots and handles the dock
// and Settings commands. Keys reuse the real app's where one exists
// (dock:show-panel, dock:close-panel, settings:tabs, dock:overlays).
import {
  Command,
  type CommandDeclaration,
  type Commands,
  passthrough,
} from "@statewalker/shared-commands";
import { defineKeyedSlot, defineSlot } from "@statewalker/shared-slots";
import type { ComponentType, ReactNode } from "react";
import type { PanelCommand } from "../file-panels/file-panel.js";
import type { SectionGroup } from "../settings/settings-model.js";
import type { Citation } from "../viewers/files.js";
import type { Zone } from "../workspace-layout/zones.js";

export type Icon = ComponentType<{ className?: string }>;

/** A view a feature adds: where it goes, and what it shows. */
export interface AppView {
  id: string;
  title: string;
  Icon: Icon;
  /** Its zone on the dock. Center views open on demand, beside the active file panel. */
  zone: Zone;
  /** A left view on the activity bar, in this order (lower first). */
  activity?: number;
  /** On a phone: a bottom-bar button, or an entry under More. Without it, opened only by a command. */
  mobile?: "tab" | "more";
  render(): ReactNode;
}

export const MENUS = ["File", "Edit", "View", "Go", "Assistant", "Mesh", "Help"] as const;
export type MenuName = (typeof MENUS)[number];

/** One menu entry; `menuItem()` builds it from a command and its payload. */
export interface AppMenuItem {
  id: string;
  menu: MenuName;
  /** Lower first; 100 when absent. */
  order?: number;
  label: string;
  Icon?: Icon;
  /** Shown beside the label and bound as a key: "Ctrl+,", "F5", "Del". */
  shortcut?: string;
  /** Puts the item in a submenu of its menu ("Layout", "Theme"). */
  submenu?: string;
  /** The key of the command it runs. */
  command: string;
  run(commands: Commands): void;
}

/** A Settings section. */
export interface SettingsTab {
  id: string;
  label: string;
  group: SectionGroup;
  keywords: string[];
  /** Lower first; the "you" sections come before the admin ones. */
  order: number;
  /** `go` switches to another section (a link inside a section). */
  render(go: (id: string) => void): ReactNode;
}

/** Something on the top bar, right of the menus. */
export interface HeaderItem {
  id: string;
  order: number;
  Component: ComponentType;
}

/** Rendered over the whole App: a dialog, the lock screen. */
export interface AppOverlay {
  id: string;
  Component: ComponentType;
}

export const appViewsSlot = defineKeyedSlot<AppView>("app:views");
export const menuItemsSlot = defineSlot<AppMenuItem>("app:menu-items");
export const settingsTabsSlot = defineKeyedSlot<SettingsTab>("settings:tabs");
export const headerItemsSlot = defineSlot<HeaderItem>("app:header-items");
export const overlaysSlot = defineSlot<AppOverlay>("dock:overlays");

export type AppTheme = "light" | "dark" | "system";
export type AppLayoutId = "assistant" | "reading";

function silent<P>(key: string): CommandDeclaration<P, void> {
  return Command.silent(key).input(passthrough<P>()).output(passthrough<void>()).build();
}

/** Opens a view in its zone, or brings it forward where it is. */
export const ShowPanel = silent<{ id: string }>("dock:show-panel");
/** Closes a dock tab: `id`, or the active one. */
export const ClosePanel = silent<{ id?: string }>("dock:close-panel");
/** Opens Settings at `section`, or at the last section shown. */
export const OpenSettings = silent<{ section?: string }>("settings:open");
/** Lays the dock out again from a predefined layout. */
export const ApplyLayout = silent<{ id: AppLayoutId }>("app:layout");
export const SetTheme = silent<{ theme: AppTheme }>("app:set-theme");
/** A file panel beside the active one, at its folder. */
export const NewFilePanel = silent<void>("files:new-panel");
/** A file panel command, run on the active file panel and its selection. */
export const RunFileCommand = silent<{ command: PanelCommand }>("files:command");
/**
 * Opens a file of the user's folder — `path` as the views name it ("Notes/todo.md") — as a
 * tab beside the active file panel (an open one comes forward); on a phone, full screen.
 */
export const OpenFile = silent<{ path: string; citation?: Citation }>("files:open");
/** Shows a file's folder in the active docked file panel, with the file selected. */
export const RevealFile = silent<{ path: string }>("files:reveal");
export const ShowShortcuts = silent<void>("app:shortcuts");
export const ShowAbout = silent<void>("app:about");
export const Lock = silent<void>("mesh:lock");

/** A menu entry that runs `command` with `payload`. */
export function menuItem<P>(
  command: CommandDeclaration<P, void>,
  payload: P,
  item: Omit<AppMenuItem, "command" | "run">,
): AppMenuItem {
  return {
    ...item,
    command: command.key,
    run: (commands) => {
      commands.call(command, payload).promise.catch((e: unknown) => console.error(e));
    },
  };
}
