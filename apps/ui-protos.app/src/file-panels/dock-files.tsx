// File panels and file viewers as dock tabs. A dock (the dock commander, the
// workspace) registers `fileDockComponents`, wraps itself in
// `<FilesInDock.Provider value={useFilesInDock(...)}>`, and the commander's
// panels appear as tabs in the center zone; the user moves them like any tab.
import type { DockviewApi, IDockviewPanel, IDockviewPanelProps } from "dockview-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { type PanelContribution, placePanel } from "../workspace-layout/zones.js";
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

/**
 * Adds a background tab next to `near` (a file tab), or in the center zone, or (an empty
 * dock) as the dock's first panel. With `beside`, it opens to the right of
 * `near` instead of as a tab.
 */
function addTab(
  api: DockviewApi,
  tab: { id: string; title: string; component: string },
  near: string | undefined,
  beside?: boolean,
): void {
  // Only a file tab is a reference: a new panel never lands beside the assistant, say.
  const reference = near ? api.getPanel(near) : undefined;
  if (reference && [FILE_PANEL, FILE_VIEWER].includes(componentOf(reference))) {
    const zone = (reference.params as { zone?: string } | undefined)?.zone ?? "center";
    api.addPanel({
      ...tab,
      params: { zone },
      position: { referencePanel: reference.id, direction: beside ? "right" : "within" },
      inactive: true,
    });
  } else if (!placePanel(api, { ...tab, targets: ["center"] })) {
    api.addPanel({ ...tab, params: { zone: "center" } });
  }
}

/**
 * Keeps the dock's file tabs in step with the commander: a new commander panel
 * gets a tab, a closed tab closes its panel, the active tab is the commander's
 * active panel, a tab's title follows its folder, and an opened file gets a
 * viewer tab. With `split`, the first panels open side by side, not as tabs.
 */
export function useFilesInDock(
  commander: Commander,
  api: DockviewApi | null,
  options: { phone?: boolean; split?: boolean } = {},
) {
  const [viewers, setViewers] = useState<Record<string, Viewer>>({});
  // A dock being laid out again (cleared, restored) removes tabs the user didn't close.
  const quiet = useRef(false);
  const split = useRef(options.split);

  const sync = () => {
    if (!api) return;
    let previous: string | undefined;
    for (const panel of commander.panels) {
      const title = commander.title(panel.path);
      const tab = api.getPanel(panel.id);
      if (tab) {
        if (tab.title !== title) tab.api.setTitle(title);
      } else {
        const near = split.current ? previous : api.activePanel?.id;
        addTab(api, { id: panel.id, title, component: FILE_PANEL }, near, split.current);
        if (panel.id === commander.activeId) api.getPanel(panel.id)?.api.setActive();
      }
      previous = panel.id;
    }
    split.current = false;
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
    const tab = api.getPanel(id);
    if (tab) tab.api.setActive();
    else {
      const title = viewer.path.split("/").at(-1) ?? viewer.path;
      addTab(api, { id, title, component: FILE_VIEWER }, api.activePanel?.id);
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

function FilePanelTab({ api }: IDockviewPanelProps) {
  const { commander, phone } = useFilesDock();
  const panel = commander.panels.find((p) => p.id === api.id);
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

export const fileDockComponents = { [FILE_PANEL]: FilePanelTab, [FILE_VIEWER]: FileViewerTab };
