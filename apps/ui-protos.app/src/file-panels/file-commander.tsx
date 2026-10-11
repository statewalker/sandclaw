import {
  Button,
  cn,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@statewalker/ui.view.shadcn";
import { basename } from "@statewalker/webrun-files";
import { Plus, X } from "lucide-react";
import { Fragment, type KeyboardEvent } from "react";
import { FilePanel } from "./file-panel.js";
import {
  type CommanderOptions,
  type PanelState,
  useCommander,
  useNarrow,
  ViewerBody,
} from "./use-commander.js";

export interface FileCommanderProps extends CommanderOptions {
  /** One panel at a time; also when the screen is narrower than 640 px. */
  phone?: boolean;
}

/** Several file panels side by side, with copy and move between them, progress, and a preview. */
export function FileCommander(props: FileCommanderProps) {
  const commander = useCommander(props);
  const { panels, activeId, activate, addPanel, closePanel, title, viewer, setViewer } = commander;
  const narrow = useNarrow();
  const phone = props.phone || narrow;

  // Tab from a panel's list goes to the next panel's list.
  const onPanelKeyDown = (index: number) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Tab" || phone || panels.length < 2) return;
    if ((e.target as HTMLElement).getAttribute("role") !== "grid") return;
    e.preventDefault();
    const next = panels[(index + (e.shiftKey ? -1 : 1) + panels.length) % panels.length];
    if (!next) return;
    activate(next.id);
    e.currentTarget.ownerDocument
      .querySelector<HTMLElement>(`[data-panel="${next.id}"] [role=grid]`)
      ?.focus();
  };

  const renderPanel = (panel: PanelState, index: number) => {
    const name = title(panel.path);
    return (
      <section
        aria-label={name}
        data-panel={panel.id}
        onMouseDown={() => activate(panel.id)}
        onKeyDown={onPanelKeyDown(index)}
        className="flex h-full min-h-0 min-w-0 flex-col gap-1"
      >
        {phone ? null : (
          <div className="flex min-w-0 items-center gap-1 px-1 text-sm">
            <span className="min-w-0 truncate font-medium">{name}</span>
            {panels.length > 1 ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                aria-label={`Close ${name}`}
                title="Close panel"
                onClick={() => closePanel(panel.id)}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <FilePanel
            {...commander.panelProps(panel)}
            active={!phone && panels.length > 1 && panel.id === activeId}
            phone={phone}
          />
        </div>
      </section>
    );
  };

  const viewerPane = viewer ? (
    <section
      aria-label="Viewer"
      className="flex h-full min-h-0 min-w-0 flex-col rounded-md border bg-background"
    >
      <div className="flex min-w-0 items-center gap-1 border-b p-1 pl-2 text-sm">
        <span className="min-w-0 truncate font-medium">{basename(viewer.path)}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Close viewer"
          onClick={() => setViewer(undefined)}
        >
          <X className="size-4" />
        </Button>
      </div>
      <ViewerBody viewer={viewer} />
    </section>
  ) : null;

  const activePanel = panels.find((p) => p.id === activeId) ?? panels[0];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-1">
        {phone ? (
          <div role="tablist" aria-label="Panels" className="flex min-w-0 gap-1 overflow-x-auto">
            {panels.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === activePanel?.id && !viewer}
                onClick={() => {
                  setViewer(undefined);
                  activate(p.id);
                }}
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-sm",
                  p.id === activePanel?.id && !viewer
                    ? "bg-accent font-medium"
                    : "hover:bg-accent/50",
                )}
              >
                {title(p.path)}
              </button>
            ))}
          </div>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto shrink-0"
          onClick={() => activePanel && addPanel(activePanel.path)}
        >
          <Plus className="size-4" /> New panel
        </Button>
        {phone && panels.length > 1 && activePanel ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Close ${title(activePanel.path)}`}
            onClick={() => closePanel(activePanel.id)}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      {commander.noticeBar}

      <div className="min-h-0 flex-1">
        {phone ? (
          (viewerPane ?? (activePanel ? renderPanel(activePanel, 0) : null))
        ) : (
          <ResizablePanelGroup orientation="horizontal">
            {panels.map((panel, i) => (
              <Fragment key={panel.id}>
                {i > 0 ? <ResizableHandle className="mx-1" /> : null}
                <ResizablePanel id={`panel-${panel.id}`} minSize={200}>
                  {renderPanel(panel, i)}
                </ResizablePanel>
              </Fragment>
            ))}
            {viewerPane ? (
              <>
                <ResizableHandle className="mx-1" />
                <ResizablePanel id="viewer" minSize={200}>
                  {viewerPane}
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        )}
      </div>

      {commander.progressStrip}
      {commander.dialogs}
    </div>
  );
}
