// The two presenters that replace or complement the dock on narrow screens.
// Both render the same panels as the dock, through the same `renderPanel`.
import { Button, cn } from "@statewalker/ui.view.shadcn";
import {
  FileText,
  Folder,
  ListChecks,
  ListTodo,
  type LucideIcon,
  PanelsTopLeft,
  Sparkles,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { PanelContribution } from "./zones.js";

const ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  todos: ListTodo,
  assistant: Sparkles,
  tasks: ListChecks,
};

const iconOf = (panel: PanelContribution) => ICONS[panel.id] ?? PanelsTopLeft;

export type RenderPanel = (panel: PanelContribution) => ReactNode;

/**
 * Compact mode: an activity bar on the left of the dock. Each button opens one
 * side panel (whose zones the compact layout does not have) as an overlay on
 * the side it prefers. Clicking outside or pressing Escape closes it. With no
 * panels (desktop) it renders only its children, so the dock inside keeps its
 * place in the tree and is not remounted when the mode changes.
 */
export function SidePanelOverlays({
  panels,
  renderPanel,
  children,
}: {
  panels: PanelContribution[];
  renderPanel: RenderPanel;
  children: ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = panels.find((p) => p.id === openId);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-0 flex-1">
      {panels.length > 0 && (
        <nav
          className="flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2"
          aria-label="Side panels"
        >
          {panels.map((p) => {
            const Icon = iconOf(p);
            return (
              <Button
                key={p.id}
                variant={p.id === openId ? "secondary" : "ghost"}
                size="icon"
                aria-label={p.title}
                aria-pressed={p.id === openId}
                title={p.title}
                onClick={() => setOpenId(p.id === openId ? null : p.id)}
              >
                <Icon />
              </Button>
            );
          })}
        </nav>
      )}
      <div className="relative min-h-0 min-w-0 flex-1">
        {children}
        {open && (
          <>
            <button
              type="button"
              aria-label="Close panel"
              className="absolute inset-0 z-10 bg-black/20"
              onClick={() => setOpenId(null)}
            />
            <aside
              aria-label={open.title}
              className={cn(
                "bg-background absolute inset-y-0 z-20 flex w-[min(360px,85%)] flex-col shadow-xl",
                open.targets[0] === "right" ? "right-0 border-l" : "left-0 border-r",
              )}
            >
              <div className="flex h-10 shrink-0 items-center justify-between border-b px-3 text-sm font-medium">
                {open.title}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                  onClick={() => setOpenId(null)}
                >
                  <X />
                </Button>
              </div>
              <div className="min-h-0 flex-1">{renderPanel(open)}</div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Mobile mode: no dock. One view fills the screen and a bottom bar switches
 * between views: "Documents" (the center panels, with a tab row) and each
 * other placed panel. Drag and drop does not exist here.
 */
export function MobileStack({
  panels,
  renderPanel,
}: {
  panels: PanelContribution[];
  renderPanel: RenderPanel;
}) {
  const documents = panels.filter((p) => p.targets[0] === "center");
  const others = panels.filter((p) => p.targets.length > 0 && p.targets[0] !== "center");
  const views = [
    ...(documents.length ? [{ id: "documents", title: "Documents", Icon: FileText }] : []),
    ...others.map((p) => ({ id: p.id, title: p.title, Icon: iconOf(p) })),
  ];
  const [viewId, setViewId] = useState(views[0]?.id ?? "");
  const [docId, setDocId] = useState(documents[0]?.id ?? "");
  const view = views.find((v) => v.id === viewId) ?? views[0];
  const doc = documents.find((d) => d.id === docId) ?? documents[0];
  const panel = view?.id === "documents" ? doc : others.find((p) => p.id === view?.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {view?.id === "documents" && documents.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1" role="tablist">
          {documents.map((d) => (
            <Button
              key={d.id}
              role="tab"
              aria-selected={d.id === doc?.id}
              size="sm"
              variant={d.id === doc?.id ? "secondary" : "ghost"}
              onClick={() => setDocId(d.id)}
            >
              {d.title}
            </Button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">{panel && renderPanel(panel)}</div>
      <nav className="flex shrink-0 border-t" aria-label="Views">
        {views.map(({ id, title, Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={id === view?.id ? "page" : undefined}
            onClick={() => setViewId(id)}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs",
              id === view?.id ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {title}
          </button>
        ))}
      </nav>
    </div>
  );
}
