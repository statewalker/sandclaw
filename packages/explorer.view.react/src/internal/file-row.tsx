import type { FileDisplayEntry } from "@statewalker/explorer.core";
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
} from "lucide-react";
import type { ComponentType, DragEvent, ReactElement } from "react";

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  folder: Folder,
  "file-text": FileText,
  "file-image": FileImage,
  "file-audio": FileAudio,
  "file-video": FileVideo,
  "file-code": FileCode,
  "file-archive": FileArchive,
  file: File,
};

interface FileRowProps {
  entry: FileDisplayEntry;
  isCursor: boolean;
  isSelected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onActivate: () => void;
  onDragStart: (e: DragEvent) => void;
}

/** One file/directory row with icon, name, size, and last-modified date. */
export function FileRow({
  entry,
  isCursor,
  isSelected,
  draggable,
  onSelect,
  onActivate,
  onDragStart,
}: FileRowProps): ReactElement {
  const IconComponent = ICON_MAP[entry.icon] ?? File;
  const isDir = entry.kind === "directory";

  return (
    // biome-ignore lint/a11y/useFocusableInteractive: rows are non-focusable on purpose — keyboard nav is handled at the section level (listbox pattern)
    // biome-ignore lint/a11y/useKeyWithClickEvents: same as above — keyboard activation lives on the parent section (Enter on cursor row)
    <div
      role="option"
      aria-selected={isSelected}
      data-cursor={isCursor || undefined}
      className={[
        "fe-row group flex items-center gap-3 px-3 py-1 cursor-pointer transition-colors border-b border-border/50",
        isCursor ? "bg-primary/15" : isSelected ? "bg-accent/40" : "hover:bg-accent/20",
      ].join(" ")}
      onClick={onSelect}
      onDoubleClick={onActivate}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className="shrink-0">
        <IconComponent className={`size-4 ${entry.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm truncate block">{entry.name}</span>
      </div>
      <div className="w-20 text-right shrink-0">
        <span className="text-xs text-muted-foreground">
          {isDir && entry.name !== ".." ? "<DIR>" : entry.displaySize}
        </span>
      </div>
      <div className="w-20 text-right shrink-0">
        <span className="text-xs text-muted-foreground">{entry.displayDate}</span>
      </div>
    </div>
  );
}
