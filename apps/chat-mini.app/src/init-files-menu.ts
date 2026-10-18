import { NewFileExplorerPanelCommand } from "@statewalker/explorer.core";
import { type AppContext, defineAction, provideAction } from "@statewalker/kernel.core";
import { FolderPlus } from "lucide-react";

/**
 * Contributes the "Files" menu to the chat app's menubar — `chat-mini.app`
 * embeds the file-explorer (browse/open files alongside chat). The single item
 * spins up a fresh file-explorer dock tab on demand (no two-pane preset: the
 * chat is the primary view, file panels open when asked for).
 */
export default function initFilesMenu(ctx: AppContext): () => void {
  return provideAction(
    ctx,
    defineAction(
      NewFileExplorerPanelCommand,
      {},
      {
        id: "chat-mini:new-file-panel",
        menu: "Files",
        order: 50,
        label: "New file panel",
        icon: FolderPlus,
      },
    ),
  );
}
