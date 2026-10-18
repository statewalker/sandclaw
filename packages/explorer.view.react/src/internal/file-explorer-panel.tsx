import {
  activeFileExplorerPanelsSlot,
  createPanelController,
  type PanelController,
} from "@statewalker/explorer.core";
import { OpenCommand } from "@statewalker/mime.core";
import { Commands } from "@statewalker/shared-commands";
import { Slots } from "@statewalker/shared-slots";
import { useAdapter, useAppWorkspace } from "@statewalker/ui.view.react";
import { type ReactElement, useEffect, useMemo } from "react";
import { FilesListView } from "./files-list-view.js";

export interface FileExplorerPanelProps {
  /** Stable id used for DnD channel + future addressing. */
  panelId: string;
  /** Initial directory; defaults to "/". */
  initialPath?: string;
  /** Tab/panel label propagated to the model's `title`. */
  label?: string;
  /** Forwarded to the active-panels registry (see preset's `mainViewerHost`). */
  mainViewerHost?: boolean;
  /** Forwarded to the active-panels registry (see preset's `folderNavigationHost`). */
  folderNavigationHost?: boolean;
}

/**
 * One file-explorer panel. The panel owns its `PanelController`
 * (model + I/O glue) but stays decoupled from activation routing —
 * every click/keypress dispatches `files:open` with this panel's id
 * as both `origin` and `target`, so folders navigate in-place. The
 * workspace-level command handler honors `target` first, falling back
 * to the workspace's folder-navigation host only when the caller
 * (e.g. an agent) supplies no target.
 *
 * Two-pane preset (explorer.app): the renderer mounts two of these,
 * one with `panelId="left"` and one with `panelId="right"`.
 */
export function FileExplorerPanel({
  panelId,
  initialPath,
  label,
  mainViewerHost = false,
  folderNavigationHost = false,
}: FileExplorerPanelProps): ReactElement {
  const workspace = useAppWorkspace();
  const commands = useAdapter(Commands);
  const slots = useAdapter(Slots);

  const panel: PanelController = useMemo(
    () =>
      createPanelController({
        files: workspace.files,
        title: label ?? panelId,
        initialPath,
      }),
    [workspace, panelId, label, initialPath],
  );

  useEffect(() => {
    return slots.register(activeFileExplorerPanelsSlot, panelId, {
      navigate: (path: string) => panel.navigate(path),
      isMainViewerHost: mainViewerHost,
      isFolderNavigationHost: folderNavigationHost,
    });
  }, [panel, panelId, slots, mainViewerHost, folderNavigationHost]);

  function handleOpen(uri: string): void {
    commands.call(OpenCommand, { uri, origin: panelId, target: panelId }).promise.catch((err) => {
      console.error("[file-explorer] files:open failed:", err);
    });
  }

  return <FilesListView model={panel.model} panelId={panelId} onOpen={handleOpen} />;
}
