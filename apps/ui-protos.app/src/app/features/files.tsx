import {
  ClipboardCopy,
  FilePen,
  FilePlus,
  FolderPlus,
  FolderTree,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import { DemoStorageSettings } from "../../file-mounts/demo-storage-settings.js";
import { FolderBar } from "../../workspace-layout/workspace.js";
import {
  appViewsSlot,
  ClosePanel,
  menuItem,
  menuItemsSlot,
  NewFilePanel,
  OpenFile,
  OpenSettings,
  RevealFile,
  RunFileCommand,
  ShowPanel,
} from "../contracts.js";
import { all, type Feature, handle, provideAll, settingsTab } from "../runtime.js";
import { worldPath } from "../world.js";

/** The Files tree, the file commands on the active panel, and Settings › Storages. */
export const files: Feature = {
  id: "files",
  label: "Files",
  contribute(rt, ctx) {
    const active = () => {
      const c = ctx.commander.current;
      const panel = c?.panels.find((p) => p.id === c.activeId);
      return c && panel ? { c, panel } : undefined;
    };
    return all(
      rt.slots.register(appViewsSlot, "files-tree", {
        id: "files-tree",
        title: "Files",
        Icon: FolderTree,
        zone: "left",
        activity: 10,
        render: () => <FolderBar />,
      }),
      provideAll(rt.slots, menuItemsSlot, [
        menuItem(NewFilePanel, undefined, {
          id: "file.new-panel",
          menu: "File",
          order: 10,
          label: "New file panel",
          Icon: FilePlus,
        }),
        menuItem(
          RunFileCommand,
          { command: "new-note" },
          { id: "file.new-note", menu: "File", order: 20, label: "New note", Icon: FilePen },
        ),
        menuItem(
          ClosePanel,
          {},
          { id: "file.close-tab", menu: "File", order: 70, label: "Close tab", Icon: X },
        ),
        menuItem(
          OpenSettings,
          { section: "storages" },
          { id: "file.storages", menu: "File", order: 75, label: "Storages…" },
        ),
        menuItem(
          RunFileCommand,
          { command: "copy" },
          {
            id: "edit.copy",
            menu: "Edit",
            order: 10,
            label: "Copy to other panel",
            Icon: ClipboardCopy,
            shortcut: "F5",
          },
        ),
        menuItem(
          RunFileCommand,
          { command: "move" },
          {
            id: "edit.move",
            menu: "Edit",
            order: 20,
            label: "Move",
            Icon: Scissors,
            shortcut: "F6",
          },
        ),
        menuItem(
          RunFileCommand,
          { command: "rename" },
          { id: "edit.rename", menu: "Edit", order: 30, label: "Rename", shortcut: "F2" },
        ),
        menuItem(
          RunFileCommand,
          { command: "mkdir" },
          {
            id: "edit.mkdir",
            menu: "Edit",
            order: 40,
            label: "New folder",
            Icon: FolderPlus,
            shortcut: "F7",
          },
        ),
        menuItem(
          RunFileCommand,
          { command: "delete" },
          {
            id: "edit.delete",
            menu: "Edit",
            order: 50,
            label: "Delete",
            Icon: Trash2,
            shortcut: "Del",
          },
        ),
        menuItem(
          ShowPanel,
          { id: "files-tree" },
          { id: "go.file", menu: "Go", order: 10, label: "Files", Icon: FolderTree },
        ),
      ]),
      settingsTab(rt.slots, "storages", 35, () => <DemoStorageSettings vault="unlocked" />),
      handle(rt, NewFilePanel, () => {
        const a = active();
        ctx.commander.current?.addPanel(a?.panel.path ?? "/");
      }),
      handle(rt, RunFileCommand, ({ command }) => {
        const a = active();
        if (!a) return;
        a.c
          .panelProps(a.panel)
          .onCommand?.(command, { path: a.panel.path, selected: a.panel.selected });
      }),
      handle(rt, OpenFile, ({ path, citation }) => {
        void ctx.commander.current?.openFile(worldPath(path), undefined, citation);
      }),
      handle(rt, RevealFile, ({ path }) => ctx.commander.current?.reveal(worldPath(path))),
    );
  },
};
