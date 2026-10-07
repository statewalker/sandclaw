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
import {
  type DockviewApi,
  DockviewReact,
  type DockviewReadyEvent,
  type SerializedDockview,
} from "dockview-react";
import { Lock, LockOpen, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { group } from "../mock.js";
import {
  AssistantPanel,
  DocumentPanel,
  FolderPanel,
  SpreadsheetPanel,
  TasksPanel,
  TodosPanel,
} from "./panels.js";
import {
  applyPreset,
  canRestore,
  type PanelContribution,
  type Preset,
  setZoneHeaders,
} from "./zones.js";

const components = {
  folder: FolderPanel,
  todos: TodosPanel,
  document: DocumentPanel,
  spreadsheet: SpreadsheetPanel,
  assistant: AssistantPanel,
  tasks: TasksPanel,
};

/** What a typical install contributes: one panel per plugin, each with its default zone. */
export const installedPanels: PanelContribution[] = [
  { id: "folder", title: "Folder", component: "folder", zone: "left" },
  { id: "todos", title: "Todos", component: "todos", zone: "left" },
  { id: "offer", title: "Dupont — offer.docx", component: "document", zone: "center" },
  { id: "q3", title: "2026-Q3.xlsx", component: "spreadsheet", zone: "center" },
  { id: "assistant", title: "Assistant", component: "assistant", zone: "right" },
  { id: "tasks", title: "Tasks", component: "tasks", zone: "bottom" },
];

export const presets: Preset[] = [
  {
    id: "assistant",
    label: "Assistant",
    zones: {
      left: ["folder", "todos"],
      center: ["offer", "q3"],
      right: ["assistant"],
      bottom: ["tasks"],
    },
    sizes: { left: 260, right: 360, bottom: 48 },
  },
  {
    id: "reading",
    label: "Reading",
    zones: { left: ["folder"], center: ["offer", "q3"] },
    sizes: { left: 220 },
  },
];

export interface WorkspaceProps {
  installed?: PanelContribution[];
  initialPreset?: string;
  initiallyLocked?: boolean;
}

export function Workspace({
  installed = installedPanels,
  initialPreset = "assistant",
  initiallyLocked = true,
}: WorkspaceProps) {
  const api = useRef<DockviewApi | null>(null);
  // The user's own arrangement of each preset, kept while switching presets.
  const saved = useRef(new Map<string, SerializedDockview>());
  const [presetId, setPresetId] = useState(initialPreset);
  const [locked, setLocked] = useState(initiallyLocked);
  const [missing, setMissing] = useState<string[]>([]);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const load = (id: string) => {
    const dock = api.current;
    const preset = presets.find((p) => p.id === id);
    if (!dock || !preset) return;
    const layout = saved.current.get(id);
    if (layout && canRestore(layout, installed)) {
      dock.fromJSON(layout);
      setMissing([]);
    } else {
      saved.current.delete(id);
      setMissing(applyPreset(dock, preset, installed));
    }
    setZoneHeaders(dock, lockedRef.current);
  };

  const onReady = (event: DockviewReadyEvent) => {
    api.current = event.api;
    load(presetId);
  };

  const switchPreset = (id: string) => {
    if (api.current) saved.current.set(presetId, api.current.toJSON());
    setPresetId(id);
    load(id);
  };

  const reset = () => {
    saved.current.delete(presetId);
    load(presetId);
  };

  useEffect(() => {
    if (api.current) setZoneHeaders(api.current, locked);
  }, [locked]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <span className="bg-secondary flex items-center gap-2 rounded-full px-3 py-1 text-xs">
          <span className="bg-primary size-2 rounded-full" /> {group.name} · connected
        </span>
        <div className="flex-1" />
        <Select value={presetId} onValueChange={switchPreset}>
          <SelectTrigger className="h-8 w-36" aria-label="Layout">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => setLocked(!locked)}>
          {locked ? <Lock /> : <LockOpen />} {locked ? "Layout locked" : "Layout unlocked"}
        </Button>
        <Button variant="ghost" size="sm" onClick={reset}>
          <RotateCcw /> Reset
        </Button>
      </header>
      {missing.length > 0 && (
        <div className="text-muted-foreground border-b px-4 py-2 text-xs">
          Not installed, left out of this layout: {missing.join(", ")}
        </div>
      )}
      <DockviewReact
        className="dockview-theme-light dockview-theme-sandclaw min-h-0 flex-1"
        components={components}
        onReady={onReady}
        disableDnd={locked}
        disableFloatingGroups
      />
    </div>
  );
}
