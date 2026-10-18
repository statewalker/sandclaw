import type { FilesListModel } from "@statewalker/explorer.core";
import { Loader2, X } from "lucide-react";
import type { DragEvent, ReactElement } from "react";
import { Breadcrumb } from "./breadcrumb.js";
import { FileRow } from "./file-row.js";
import { useViewModel } from "./use-view-model.js";

interface FilesListViewProps {
  model: FilesListModel;
  /** Stable id used as the DnD `application/x-fe-panel` channel. */
  panelId: string;
  /**
   * Activation callback. Fired for every navigation/open gesture
   * (single-click on folder, double-click, Enter, Backspace-up,
   * breadcrumb click). The host wires this to the `files:open` command.
   */
  onOpen: (path: string) => void;
}

/** Panel-internal list view: breadcrumb + filter + sortable table. */
export function FilesListView({ model, panelId, onOpen }: FilesListViewProps): ReactElement {
  useViewModel(model);

  const visible = model.getDisplayEntries();
  const dirCount = visible.filter((e) => e.kind === "directory" && e.name !== "..").length;
  const fileCount = visible.filter((e) => e.kind === "file").length;
  const parts: string[] = [];
  if (dirCount > 0) parts.push(`${dirCount} dir${dirCount > 1 ? "s" : ""}`);
  if (fileCount > 0) parts.push(`${fileCount} file${fileCount > 1 ? "s" : ""}`);
  if (model.selectedPaths.size > 0) parts.push(`${model.selectedPaths.size} selected`);
  if (model.filter) parts.push(`filter: "${model.filter}"`);
  const footerText = parts.join(", ") || "Empty";

  function activateCursor(): void {
    const entry = model.getCursorEntry();
    if (entry) onOpen(entry.path);
  }

  function navigateUp(): void {
    if (model.path === "/") return;
    const dotdot = model.getVisibleEntries().find((e) => e.name === "..");
    if (dotdot) onOpen(dotdot.path);
  }

  function handleSelect(index: number): void {
    model.cursorIndex = index;
    const entry = model.getVisibleEntries()[index];
    // Single-click navigation for directories matches the user's
    // mental model from web file browsers. Files still require
    // double-click (or Enter) so they can be selected for drag.
    if (entry?.kind === "directory") {
      onOpen(entry.path);
    } else {
      model.notify();
    }
  }

  function handleActivate(index: number): void {
    model.cursorIndex = index;
    const entry = model.getVisibleEntries()[index];
    if (entry) onOpen(entry.path);
  }

  function handleDragStart(e: DragEvent, path: string): void {
    const paths = model.selectedPaths.size > 0 ? [...model.selectedPaths] : [path];
    e.dataTransfer.effectAllowed = "copyMove";
    e.dataTransfer.setData("text/plain", paths.join("\n"));
    e.dataTransfer.setData("application/x-fe-panel", panelId);
  }

  function sortIndicator(field: "name" | "size" | "lastModified"): string {
    if (model.sortField !== field) return "";
    return model.sortAscending ? " ▲" : " ▼";
  }

  return (
    <section
      aria-label={`Files panel ${panelId}`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: panel needs focus for the keyboard nav (Arrow/PageUp/Down/Home/End/Enter/Backspace/Insert) wired below
      tabIndex={0}
      className="fe-panel flex flex-col h-full focus:outline-none"
      data-fe-panel={panelId}
      // Grab focus on any click inside the panel so keyboard nav engages
      // without the user having to tab in first. Skip when the click lands
      // on a natively-focusable element (filter input, breadcrumb, sort
      // header) so those still receive focus normally. Rows are not
      // focusable (see FileRow) — they fall through to focusing the section.
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest("button, input, textarea, select, a")) {
          e.currentTarget.focus();
        }
      }}
      onKeyDown={(e) => {
        switch (e.key) {
          case "ArrowUp":
            e.preventDefault();
            model.moveCursor(-1);
            break;
          case "ArrowDown":
            e.preventDefault();
            model.moveCursor(1);
            break;
          case "PageUp":
            e.preventDefault();
            model.moveCursor(-model.pageSize);
            break;
          case "PageDown":
            e.preventDefault();
            model.moveCursor(model.pageSize);
            break;
          case "Home":
            e.preventDefault();
            model.cursorIndex = 0;
            model.notify();
            break;
          case "End":
            e.preventDefault();
            model.cursorIndex = Math.max(0, model.getVisibleEntries().length - 1);
            model.notify();
            break;
          case "Enter":
            e.preventDefault();
            activateCursor();
            break;
          case "Backspace":
            e.preventDefault();
            navigateUp();
            break;
          case "Insert":
            e.preventDefault();
            model.toggleSelect(model.cursorIndex);
            model.moveCursor(1);
            break;
          default:
            break;
        }
      }}
    >
      <div className="flex items-center gap-2 py-1 px-2 border-b border-border/50">
        <Breadcrumb path={model.path} onNavigate={onOpen} />
        {model.loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>
      <div className="px-2 py-1 border-b border-border/50">
        <div className="relative">
          <input
            type="text"
            className="text-xs px-2 py-1 pr-7 border rounded bg-background w-full"
            placeholder="Filter..."
            value={model.filter}
            onChange={(e) => model.setFilter(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                e.preventDefault();
                model.setFilter("");
              }
            }}
          />
          {model.filter && (
            <button
              type="button"
              aria-label="Clear filter"
              className="absolute inset-y-0 right-1 flex items-center px-1 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => model.setFilter("")}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>
      {model.error && (
        <div className="text-sm text-destructive px-2 py-1 border-b border-border/50">
          {model.error}
        </div>
      )}
      <div className="flex items-center text-xs font-medium border-b border-border/50 bg-muted/30 px-3 py-1 select-none">
        <button
          type="button"
          className="flex-1 text-left hover:underline cursor-pointer"
          onClick={() => model.setSort("name")}
        >
          Name{sortIndicator("name")}
        </button>
        <button
          type="button"
          className="w-20 text-right hover:underline cursor-pointer"
          onClick={() => model.setSort("size")}
        >
          Size{sortIndicator("size")}
        </button>
        <button
          type="button"
          className="w-20 text-right hover:underline cursor-pointer"
          onClick={() => model.setSort("lastModified")}
        >
          Modified{sortIndicator("lastModified")}
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {visible.map((entry, i) => (
          <FileRow
            key={entry.path}
            entry={entry}
            isCursor={i === model.cursorIndex}
            isSelected={model.selectedPaths.has(entry.path)}
            draggable={entry.name !== ".."}
            onSelect={() => handleSelect(i)}
            onActivate={() => handleActivate(i)}
            onDragStart={(e) => handleDragStart(e, entry.path)}
          />
        ))}
      </div>
      <div className="text-xs text-muted-foreground px-2 py-1 border-t border-border/50">
        {footerText}
      </div>
    </section>
  );
}
