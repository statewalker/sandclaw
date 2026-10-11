import { Button, cn } from "@statewalker/ui.view.shadcn";
import type { FilesApi } from "@statewalker/webrun-files";
import { ChevronDown, HardDrive } from "lucide-react";
import { type DragEvent, useState } from "react";
import { breadcrumb, siblings } from "./paths.js";
import { type MenuItem, PopupMenu } from "./popup-menu.js";

export interface BreadcrumbBarProps {
  files: FilesApi;
  path: string;
  /** Mount key to display name. */
  mountNames: Record<string, string>;
  onNavigate(path: string): void;
  onDropOn?(path: string, event: DragEvent): void;
}

/** "All storages / Documents ▾ / clients ▾ / dupont ▾": each ▾ lists the folders beside that crumb. */
export function BreadcrumbBar({
  files,
  path,
  mountNames,
  onNavigate,
  onDropOn,
}: BreadcrumbBarProps) {
  const [over, setOver] = useState<string>();
  const crumbs = breadcrumb(path, mountNames);

  const dropProps = (target: string) =>
    onDropOn
      ? {
          onDragOver: (e: DragEvent) => {
            e.preventDefault();
            setOver(target);
          },
          onDragLeave: () => setOver(undefined),
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            setOver(undefined);
            onDropOn(target, e);
          },
        }
      : {};
  const highlight = (target: string) => over === target && "bg-accent ring-1 ring-primary";

  return (
    <nav aria-label="Path" className="flex flex-wrap items-center gap-x-0.5 text-sm">
      <span className="rounded-sm">
        <Button
          variant="ghost"
          size="sm"
          aria-label="All storages"
          title="All storages"
          className="h-7 px-2"
          onClick={() => onNavigate("/")}
        >
          <HardDrive className="size-4" />
        </Button>
      </span>
      {crumbs.map((crumb, i) => {
        const items = async (): Promise<MenuItem[]> => {
          try {
            const beside = (await siblings(files, crumb)).map((s) => ({
              ...s,
              name: crumb.isMount ? (mountNames[s.name] ?? s.name) : s.name,
            }));
            return beside
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => ({
                label: s.name,
                current: s.path === crumb.path,
                onSelect: () => onNavigate(s.path),
              }));
          } catch {
            return [{ label: "These folders can't be listed", disabled: true, onSelect() {} }];
          }
        };
        return (
          <span
            key={crumb.path}
            className={cn("inline-flex min-w-0 items-center rounded-sm", highlight(crumb.path))}
            {...dropProps(crumb.path)}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-7 max-w-40 min-w-0 px-2"
              aria-current={i === crumbs.length - 1 ? "location" : undefined}
              onClick={() => onNavigate(crumb.path)}
            >
              <span className="truncate">{crumb.name}</span>
            </Button>
            <PopupMenu
              label={`Folders beside ${crumb.name}`}
              trigger={<ChevronDown className="size-4" />}
              items={items}
            />
          </span>
        );
      })}
    </nav>
  );
}
