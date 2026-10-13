import "dockview-react/dist/styles/dockview.css";
import "../workspace-layout/workspace.css";
import { Button } from "@statewalker/ui.view.shadcn";
import { type DockviewApi, DockviewReact } from "dockview-react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { DOCK_THEME } from "../workspace-layout/dock-theme.js";
import {
  FilesInDock,
  fileDockComponents,
  fileTabComponents,
  useFilesInDock,
} from "./dock-files.js";
import { type CommanderOptions, useCommander, useNarrow } from "./use-commander.js";

export interface DockCommanderProps extends CommanderOptions {
  /** Phone width: one panel at a time, no drag and drop; also below 640 px. */
  phone?: boolean;
}

/**
 * The commander on the workspace dock: the file panels side by side, each
 * opened file a tab in its panel's group. Each is a dock panel the user
 * drags elsewhere, splits off or stacks as a tab.
 */
export function DockCommander(props: DockCommanderProps) {
  const commander = useCommander(props);
  const narrow = useNarrow();
  const phone = props.phone || narrow;
  const [api, setApi] = useState<DockviewApi | null>(null);
  const dock = useFilesInDock(commander, api, { phone });
  const active = commander.panels.find((p) => p.id === commander.activeId);

  return (
    <FilesInDock.Provider value={dock}>
      <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => commander.addPanel(active?.path ?? "/")}
          >
            <Plus className="size-4" /> New panel
          </Button>
        </div>
        {commander.noticeBar}
        <div className="relative min-h-0 flex-1">
          <DockviewReact
            theme={DOCK_THEME}
            className="dockview-theme-light dockview-theme-sandclaw absolute inset-0"
            components={fileDockComponents}
            tabComponents={fileTabComponents}
            onReady={(event) => setApi(event.api)}
            disableDnd={phone}
            disableFloatingGroups
          />
        </div>
        {commander.progressStrip}
        {commander.dialogs}
      </div>
    </FilesInDock.Provider>
  );
}
