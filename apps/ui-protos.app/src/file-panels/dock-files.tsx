// File panels and file viewers as dock panels. A dock (the dock commander, the
// workspace) registers `fileDockComponents`, wraps itself in
// `<FilesInDock.Provider value={useFilesInDock(...)}>`, and the commander's
// panels appear side by side in the center zone; the user drags them like any
// dock panel.
import type { DockviewApi, IDockviewPanel, IDockviewPanelProps } from "dockview-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { PanelContribution } from "../workspace-layout/zones.js";
import { FilePanel } from "./file-panel.js";
import { type Commander, type Viewer, ViewerBody } from "./use-commander.js";

export const FILE_PANEL = "file-panel";
export const FILE_VIEWER = "file-viewer";

/** For a dock that drops panels it doesn't know (`loadSavedLayout`): these two it knows. */
export const fileContributions: PanelContribution[] = [
  { id: FILE_PANEL, title: "Files", component: FILE_PANEL, targets: ["center"] },
  { id: FILE_VIEWER, title: "File", component: FILE_VIEWER, targets: ["center"] },
];

type FilesDock = ReturnType<typeof useFilesInDock>;
export const FilesInDock = createContext<FilesDock | null>(null);

const componentOf = (panel: IDockviewPanel) => panel.view.contentComponent;
const viewerId = (path: string) => `view:${path}`;

const zoneOf = (panel: IDockviewPanel) =>
  (panel.params as { zone?: string } | undefined)?.zone ?? "center";

/**
 * Adds a background panel beside `near` (to its right) or as a tab in its
 * group (`within`). Without `near`: beside the center zone's documents, or
 * (an empty dock) as the dock's first panel.
 */
function addPanel(
  api: DockviewApi,
  panel: { id: string; title: string; component: string },
  near: IDockviewPanel | undefined,
  direction: "right" | "within",
): void {
  const reference = near ?? api.panels.find((p) => zoneOf(p) === "center");
  if (!reference) {
    api.addPanel({ ...panel, params: { zone: "center" } });
    return;
  }
  api.addPanel({
    ...panel,
    params: { zone: zoneOf(reference) },
    position: { referencePanel: reference.id, direction },
    inactive: true,
  });
}

/**
 * Keeps the dock in step with the commander: each commander panel is a dock
 * panel of its own, split to the right of the panel before it (on a phone, a
 * tab in its group); a closed panel leaves the commander; the active dock
 * panel is the commander's active panel; a panel's title follows its folder.
 * Opened files share one viewer group, to the right of the file panels.
 * The user drags any of them elsewhere, like any dock panel.
 */
export function useFilesInDock(
  commander: Commander,
  api: DockviewApi | null,
  options: { phone?: boolean } = {},
) {
  const [viewers, setViewers] = useState<Record<string, Viewer>>({});
  // A dock being laid out again (cleared, restored) removes panels the user didn't close.
  const quiet = useRef(false);
  const direction = options.phone ? "within" : "right";

  const sync = () => {
    if (!api) return;
    let previous: IDockviewPanel | undefined;
    for (const panel of commander.panels) {
      if (panel.dock === false) continue;
      const title = commander.title(panel.path);
      let dockPanel = api.getPanel(panel.id);
      if (dockPanel) {
        if (dockPanel.title !== title) dockPanel.api.setTitle(title);
      } else {
        addPanel(api, { id: panel.id, title, component: FILE_PANEL }, previous, direction);
        dockPanel = api.getPanel(panel.id);
        if (panel.id === commander.activeId) dockPanel?.api.setActive();
      }
      previous = dockPanel;
    }
  };

  useEffect(() => {
    if (!api) return;
    const subscriptions = [
      api.onDidRemovePanel((panel) => {
        if (quiet.current) return;
        if (componentOf(panel) === FILE_PANEL) commander.closePanel(panel.id);
        else if (componentOf(panel) === FILE_VIEWER) {
          setViewers(({ [panel.id]: _, ...rest }) => rest);
        }
      }),
      api.onDidActivePanelChange(({ panel }) => {
        if (panel && componentOf(panel) === FILE_PANEL) commander.activate(panel.id);
      }),
    ];
    return () => {
      for (const s of subscriptions) s.dispose();
    };
  }, [api]);

  useEffect(sync, [api, commander.panels]);

  // An opened file: its viewer tab, focused if it is already open.
  const { viewer, setViewer } = commander;
  useEffect(() => {
    if (!api || !viewer) return;
    const id = viewerId(viewer.path);
    setViewers((v) => ({ ...v, [id]: viewer }));
    const open = api.getPanel(id);
    if (open) open.api.setActive();
    else {
      const title = viewer.path.split("/").at(-1) ?? viewer.path;
      const viewerGroup = api.panels.find((p) => componentOf(p) === FILE_VIEWER);
      const lastFilePanel = api.panels.filter((p) => componentOf(p) === FILE_PANEL).at(-1);
      if (viewerGroup) addPanel(api, { id, title, component: FILE_VIEWER }, viewerGroup, "within");
      else addPanel(api, { id, title, component: FILE_VIEWER }, lastFilePanel, direction);
      api.getPanel(id)?.api.setActive();
    }
    setViewer(undefined);
  }, [api, viewer]);

  return {
    commander,
    viewers,
    phone: Boolean(options.phone),
    /** Runs a re-layout of the dock without closing the panels it removes, then puts them back. */
    relayout(action: () => void) {
      quiet.current = true;
      try {
        action();
      } finally {
        quiet.current = false;
      }
      sync();
    },
  };
}

function useFilesDock(): FilesDock {
  const dock = useContext(FilesInDock);
  if (!dock) throw new Error("A file tab needs <FilesInDock.Provider> around its dock.");
  return dock;
}

/** A commander panel, by id: what a file tab shows, and what a side bar shows of its own panel. */
export function CommanderPanel({ id }: { id: string }) {
  const { commander, phone } = useFilesDock();
  const panel = commander.panels.find((p) => p.id === id);
  if (!panel) return null;
  return (
    <section
      aria-label={commander.title(panel.path)}
      data-panel={panel.id}
      onMouseDown={() => commander.activate(panel.id)}
      className="@container h-full min-h-0 min-w-0 p-1"
    >
      <FilePanel
        {...commander.panelProps(panel)}
        active={!phone && commander.panels.length > 1 && panel.id === commander.activeId}
        phone={phone}
      />
    </section>
  );
}

function FileViewerTab({ api }: IDockviewPanelProps) {
  const viewer = useFilesDock().viewers[api.id];
  if (!viewer) return null;
  return (
    <section aria-label={`Viewer: ${api.title}`} className="flex h-full min-h-0 flex-col">
      <ViewerBody viewer={viewer} />
    </section>
  );
}

function FilePanelTab({ api }: IDockviewPanelProps) {
  return <CommanderPanel id={api.id} />;
}

export const fileDockComponents = { [FILE_PANEL]: FilePanelTab, [FILE_VIEWER]: FileViewerTab };
