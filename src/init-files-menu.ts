import { menubarItemsSlot } from "@repo/app-shell";
import { NewFileExplorerPanelCommand } from "@statewalker/explorer.core";
import { Commands } from "@statewalker/shared-commands";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace.core";
import { FolderPlus } from "lucide-react";

/**
 * Contributes the "Files" menu to the chat app's menubar — `chat-mini.app`
 * embeds the file-explorer (browse/open files alongside chat). The single item
 * spins up a fresh file-explorer dock tab on demand (no two-pane preset: the
 * chat is the primary view, file panels open when asked for).
 */
export default function initFilesMenu(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);
  const commands = workspace.requireAdapter(Commands);

  const [register, cleanup] = newRegistry();

  register(
    slots.provide(menubarItemsSlot, {
      id: "chat-mini:new-file-panel",
      menu: "Files",
      order: 50,
      label: "New file panel",
      Icon: FolderPlus,
      onActivate: async () => {
        await commands.call(NewFileExplorerPanelCommand, {}).promise;
      },
    }),
  );

  return cleanup;
}
