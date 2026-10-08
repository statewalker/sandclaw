import "dockview-react/dist/styles/dockview.css";
import "./workspace.css";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@statewalker/ui.view.shadcn";
import { type DockviewApi, DockviewReact, type DockviewReadyEvent } from "dockview-react";
import { Lock, LockOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AssistantPanel } from "../assistant-panel/assistant-panel.js";
import { FolderZone } from "../folder-zone/folder-zone.js";
import { GroupPill } from "../group-status/group-status.js";
import { TodosView } from "../notes-todos/todos-view.js";
import {
  DocumentPanel,
  MissingPanel,
  OutlinePanel,
  SpreadsheetPanel,
  TasksPanel,
} from "./panels.js";
import {
  applyLayout,
  type Layout,
  loadSavedLayout,
  openPanel,
  type PanelContribution,
  placePanel,
  syncZones,
  vetoDragsFromFixedDocks,
  type Zone,
  type ZoneHeaders,
} from "./zones.js";

const MISSING = "missing";

const components = {
  folder: () => <FolderZone />,
  todos: () => <TodosView />,
  outline: OutlinePanel,
  document: DocumentPanel,
  spreadsheet: SpreadsheetPanel,
  assistant: () => <AssistantPanel scenario="deck" />,
  tasks: TasksPanel,
  [MISSING]: MissingPanel,
};

/** One panel per plugin; each names the zones it prefers, in order. */
export const allPanels: PanelContribution[] = [
  { id: "folder", title: "Folder", component: "folder", targets: ["left"] },
  { id: "todos", title: "Todos", component: "todos", targets: ["left"] },
  { id: "offer", title: "Dupont — offer.docx", component: "document", targets: ["center"] },
  { id: "q3", title: "2026-Q3.xlsx", component: "spreadsheet", targets: ["center"] },
  { id: "assistant", title: "Assistant", component: "assistant", targets: ["right"] },
  { id: "tasks", title: "Tasks", component: "tasks", targets: ["bottom"] },
  { id: "outline", title: "Outline", component: "outline", targets: [] },
];

export const layouts: Layout[] = [
  {
    id: "assistant",
    label: "Assistant",
    zones: { left: { size: 260 }, right: { size: 360 }, bottom: { size: 48 } },
  },
  { id: "reading", label: "Reading", zones: { left: { size: 220 } } },
];

/**
 * How the layout resists change:
 * - `lock-toggle`: locked by default (no drag and drop, side tab strips
 *   hidden); a button unlocks it.
 * - `always-on`: drag and drop always works; side tab strips stay hidden until
 *   the pointer is over the zone.
 * - `per-zone`: the center is always a free, tabbed dock; each side bar is
 *   fixed by default (nothing dropped in, nothing dragged out, no tab strip)
 *   and is unlocked on its own.
 */
export type LockMode = "lock-toggle" | "always-on" | "per-zone";

type SideZone = Exclude<Zone, "center">;
const SIDE_ZONES: { zone: SideZone; label: string }[] = [
  { zone: "left", label: "Left bar" },
  { zone: "right", label: "Right bar" },
  { zone: "bottom", label: "Bottom bar" },
];

export interface WorkspaceProps {
  lockMode?: LockMode;
  initialLayout?: string;
  /** Plugins installed at start (ids from `allPanels`). */
  initialPlugins?: string[];
}

export function Workspace({
  lockMode = "lock-toggle",
  initialLayout = "assistant",
  initialPlugins = allPanels.filter((p) => p.id !== "outline").map((p) => p.id),
}: WorkspaceProps) {
  const api = useRef<DockviewApi | null>(null);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [locked, setLocked] = useState(lockMode === "lock-toggle");
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const installed = allPanels.filter((p) => plugins.includes(p.id));
  const [fixedZones, setFixedZones] = useState<Record<SideZone, boolean>>({
    left: true,
    right: true,
    bottom: true,
  });
  const headersFor = (zone: Zone): ZoneHeaders => {
    if (lockMode === "always-on") return "hover";
    if (lockMode === "per-zone")
      return zone !== "center" && fixedZones[zone] ? "hidden" : "visible";
    return locked ? "hidden" : "visible";
  };
  const headersRef = useRef(headersFor);
  headersRef.current = headersFor;

  const refresh = () => {
    const dock = api.current;
    if (!dock) return;
    syncZones(dock, headersRef.current);
    setOpenIds(dock.panels.map((p) => p.id));
  };

  const layoutId = useRef(initialLayout);

  const restoreLayout = (id: string) => {
    const layout = layouts.find((t) => t.id === id);
    if (!api.current || !layout) return;
    layoutId.current = id;
    applyLayout(api.current, layout, installed);
    setNotice("");
    refresh();
  };

  const onReady = (event: DockviewReadyEvent) => {
    api.current = event.api;
    event.api.onDidLayoutChange(refresh);
    event.api.onDidMovePanel(refresh);
    vetoDragsFromFixedDocks(event.api);
    restoreLayout(initialLayout);
  };

  // Prototype control: installing or removing a plugin while the app runs.
  // Removing one goes through the same repair as loading a saved layout.
  const togglePlugin = (panel: PanelContribution) => {
    const dock = api.current;
    if (!dock) return;
    if (plugins.includes(panel.id)) {
      const next = plugins.filter((id) => id !== panel.id);
      setPlugins(next);
      const removed = loadSavedLayout(
        dock,
        dock.toJSON(),
        allPanels.filter((p) => next.includes(p.id)),
        MISSING,
      );
      // A restore loads the strip at dockview's default minimum; give it its layout height back.
      syncZones(dock, headersRef.current);
      const strip = layouts.find((t) => t.id === layoutId.current)?.zones.bottom?.size;
      const bottom = dock.groups.find(
        (g) => (g.panels[0]?.params as { zone?: string } | undefined)?.zone === "bottom",
      );
      if (strip && bottom) bottom.api.setSize({ height: strip });
      setNotice(
        removed.length
          ? `Removed from your layout: ${removed.join(", ")} (plugin uninstalled)`
          : "",
      );
    } else {
      setPlugins([...plugins, panel.id]);
      setNotice(
        placePanel(dock, panel)
          ? ""
          : `${panel.title} installed — it has no default place; open it from “Open panel”.`,
      );
    }
    refresh();
  };

  useEffect(refresh, [locked, fixedZones]);

  const closed = installed.filter((p) => !openIds.includes(p.id));

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <GroupPill state="connected" />
        <div className="flex-1" />
        <Select
          value=""
          onValueChange={(id) => {
            const panel = installed.find((p) => p.id === id);
            if (api.current && panel) openPanel(api.current, panel);
          }}
          disabled={closed.length === 0}
        >
          <SelectTrigger className="h-8 w-36" aria-label="Open panel">
            <SelectValue placeholder="Open panel" />
          </SelectTrigger>
          <SelectContent>
            {closed.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value="" onValueChange={restoreLayout}>
          <SelectTrigger className="h-8 w-44" aria-label="Restore layout">
            <SelectValue placeholder="Restore layout" />
          </SelectTrigger>
          <SelectContent>
            {layouts.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {lockMode === "per-zone" &&
          SIDE_ZONES.map(({ zone, label }) => (
            <Button
              key={zone}
              variant="ghost"
              size="sm"
              aria-pressed={fixedZones[zone]}
              title={
                fixedZones[zone] ? `${label} is fixed — click to unlock` : `${label} can be moved`
              }
              onClick={() => setFixedZones({ ...fixedZones, [zone]: !fixedZones[zone] })}
            >
              {fixedZones[zone] ? <Lock /> : <LockOpen />} {label}
            </Button>
          ))}
        {lockMode === "lock-toggle" && (
          <Button variant="ghost" size="sm" onClick={() => setLocked(!locked)}>
            {locked ? <Lock /> : <LockOpen />} {locked ? "Layout locked" : "Layout unlocked"}
          </Button>
        )}
      </header>
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 border-b border-dashed px-4 py-1.5 text-xs">
        <span>Prototype only — installed plugins:</span>
        {allPanels.map((p) => (
          <Button
            key={p.id}
            size="xs"
            variant={plugins.includes(p.id) ? "secondary" : "ghost"}
            aria-pressed={plugins.includes(p.id)}
            onClick={() => togglePlugin(p)}
          >
            {p.title}
          </Button>
        ))}
        {notice && <span className="text-foreground ml-2">{notice}</span>}
      </div>
      <DockviewReact
        className="dockview-theme-light dockview-theme-sandclaw min-h-0 flex-1"
        components={components}
        onReady={onReady}
        disableDnd={lockMode === "lock-toggle" && locked}
        disableFloatingGroups
      />
    </div>
  );
}
