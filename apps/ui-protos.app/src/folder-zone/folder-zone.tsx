import { Button, cn, Input, ScrollArea } from "@statewalker/ui.view.shadcn";
import {
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Search,
} from "lucide-react";
import { useState } from "react";
import { type FolderEntry, folder } from "../mock.js";
import { ZoneTitle } from "../zone-title.js";
import { filterTree, listFiles } from "./tree.js";

/**
 * - `empty`: no folder chosen yet;
 * - `needs-access`: the browser forgot its permission after a reload; one
 *   click (a user gesture, which the browser requires) gives it back;
 * - `indexing`: the assistant is still reading the folder;
 * - `ready`.
 */
export type FolderState = "empty" | "needs-access" | "indexing" | "ready";

/**
 * How indexing progress is shown:
 * - `footer`: one progress bar at the bottom of the zone;
 * - `marks`: files not read yet are dimmed in the tree, with a count in the header.
 */
export type IndexingDisplay = "footer" | "marks";

export interface FolderZoneProps {
  state?: FolderState;
  indexing?: IndexingDisplay;
  /** How many files the assistant has read, while indexing. */
  indexed?: number;
}

function FileIcon({ name }: { name: string }) {
  const Icon = name.endsWith(".xlsx") ? FileSpreadsheet : FileText;
  return <Icon className="text-muted-foreground size-4 shrink-0" />;
}

function Tree({
  entries,
  depth,
  prefix,
  open,
  toggle,
  selected,
  select,
  pending,
}: {
  entries: FolderEntry[];
  depth: number;
  prefix: string;
  open: (path: string) => boolean;
  toggle: (path: string) => void;
  selected: string;
  select: (path: string) => void;
  pending: Set<string>;
}) {
  return entries.map((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    const isFolder = entry.children !== undefined;
    const expanded = isFolder && open(path);
    return (
      <div key={path}>
        <button
          type="button"
          onClick={() => (isFolder ? toggle(path) : select(path))}
          className={cn(
            "hover:bg-accent flex h-8 w-full items-center gap-1.5 rounded-md pr-2 text-left text-sm",
            selected === path && "bg-accent",
            pending.has(path) && "opacity-45",
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
          title={pending.has(path) ? "Not read by the assistant yet" : undefined}
        >
          {isFolder ? (
            expanded ? (
              <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
            ) : (
              <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {isFolder ? (
            <Folder className="text-muted-foreground size-4 shrink-0" />
          ) : (
            <FileIcon name={entry.name} />
          )}
          <span className="truncate">{entry.name}</span>
        </button>
        {expanded && entry.children && (
          <Tree
            entries={entry.children}
            depth={depth + 1}
            prefix={path}
            open={open}
            toggle={toggle}
            selected={selected}
            select={select}
            pending={pending}
          />
        )}
      </div>
    );
  });
}

export function FolderZone({ state = "ready", indexing = "footer", indexed = 5 }: FolderZoneProps) {
  const [current, setCurrent] = useState(state);
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState(new Set<string>(["Finance/invoices", "Clients/contracts"]));
  const [selected, setSelected] = useState("");

  if (current === "empty") {
    return (
      <div className="flex h-full flex-col">
        <ZoneTitle>Folder</ZoneTitle>
        <div className="grid gap-2 p-3 text-sm">
          <p className="text-muted-foreground">Choose the folder the assistant works with.</p>
          <Button size="sm" onClick={() => setCurrent("indexing")}>
            <FolderOpen /> Open a folder
          </Button>
        </div>
      </div>
    );
  }

  if (current === "needs-access") {
    return (
      <div className="flex h-full flex-col">
        <ZoneTitle>Folder</ZoneTitle>
        <div className="grid gap-2 p-3 text-sm">
          <p>
            <span className="font-medium">Atelier docs</span>
          </p>
          <p className="text-muted-foreground">
            Your browser asks again for access to this folder after a restart.
          </p>
          <Button size="sm" onClick={() => setCurrent("ready")}>
            <FolderOpen /> Reconnect the folder
          </Button>
        </div>
      </div>
    );
  }

  const files = listFiles(folder).map((f) => f.path);
  const reading = current === "indexing";
  const pending = new Set(reading && indexing === "marks" ? files.slice(indexed) : []);
  const shown = filterTree(folder, query);
  return (
    <div className="flex h-full flex-col">
      <ZoneTitle
        action={
          reading && indexing === "marks" ? (
            <span className="text-muted-foreground text-xs">
              read {indexed} of {files.length}
            </span>
          ) : undefined
        }
      >
        Atelier docs
      </ZoneTitle>
      <div className="relative px-3 pb-2">
        <Search className="text-muted-foreground absolute top-2.5 left-5 size-3.5" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a file"
          aria-label="Find a file"
          className="h-8 pl-7 text-sm"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1 pb-3">
          <Tree
            entries={shown}
            depth={0}
            prefix=""
            // While searching, every folder on the way to a match is open.
            open={(path) => query.trim() !== "" || !closed.has(path)}
            toggle={(path) => {
              const next = new Set(closed);
              if (!next.delete(path)) next.add(path);
              setClosed(next);
            }}
            selected={selected}
            select={setSelected}
            pending={pending}
          />
          {shown.length === 0 && (
            <p className="text-muted-foreground px-3 text-sm">No file matches “{query}”.</p>
          )}
        </div>
      </ScrollArea>
      {reading && indexing === "footer" && (
        <div className="grid gap-1.5 border-t px-3 py-2">
          <div className="text-muted-foreground text-xs">
            Getting to know your folder · {indexed} of {files.length} files
          </div>
          <div className="bg-muted h-1 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full"
              style={{ width: `${(100 * indexed) / files.length}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
