import { Button, cn } from "@statewalker/ui.view.shadcn";
import { ArrowLeft, Ellipsis, Files } from "lucide-react";
import { CommanderPanel } from "../../file-panels/dock-files.js";
import { type Commander, ViewerBody } from "../../file-panels/use-commander.js";
import type { AppView, Icon } from "../contracts.js";

/**
 * Files on a phone: the docked file panels with a tab row, the active one shown;
 * an opened file fills the screen.
 */
function PhoneFiles({ commander }: { commander: Commander }) {
  const docked = commander.panels.filter((p) => p.dock !== false);
  const panel = commander.activeDocked();
  const { viewer, setViewer } = commander;
  if (viewer) {
    const name = viewer.path.split("/").at(-1) ?? viewer.path;
    return (
      <section aria-label={`Viewer: ${name}`} className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-1 border-b p-1">
          <Button size="sm" variant="ghost" onClick={() => setViewer(undefined)}>
            <ArrowLeft /> Back
          </Button>
          <span className="min-w-0 truncate text-sm">{name}</span>
        </div>
        <div className="min-h-0 flex-1">
          <ViewerBody viewer={viewer} />
        </div>
      </section>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      {docked.length > 1 && (
        <div role="tablist" className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1">
          {docked.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === panel?.id}
              onClick={() => commander.activate(p.id)}
              className={cn(
                "rounded-md px-3 py-1 text-sm",
                p.id === panel?.id ? "bg-secondary font-medium" : "text-muted-foreground",
              )}
            >
              {commander.title(p.path)}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">{panel && <CommanderPanel id={panel.id} />}</div>
    </div>
  );
}

/**
 * The phone: no dock; one view fills the screen. The bottom bar holds Files,
 * the views marked `mobile: "tab"`, and More, which lists the `"more"` ones.
 * `current` is "files", "more" or a view id; a view opened by a command shows
 * even when it is on neither bar.
 */
export function PhoneStack({
  views,
  current,
  onSelect,
  commander,
}: {
  views: AppView[];
  current: string;
  onSelect(id: string): void;
  commander: Commander;
}) {
  const tabs = views.filter((v) => v.mobile === "tab");
  const more = views.filter((v) => v.mobile === "more");
  const view = views.find((v) => v.id === current);
  const bar: { id: string; title: string; Icon: Icon }[] = [
    { id: "files", title: "Files", Icon: Files },
    ...tabs,
    ...(more.length ? [{ id: "more", title: "More", Icon: Ellipsis }] : []),
  ];
  const lit = view?.mobile === "more" ? "more" : current;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        {current === "files" ? (
          <PhoneFiles commander={commander} />
        ) : current === "more" ? (
          <ul className="divide-y">
            {more.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => onSelect(v.id)}
                  className="hover:bg-accent flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm"
                >
                  <v.Icon className="size-4" />
                  {v.title}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="@container h-full overflow-auto">{view?.render()}</div>
        )}
      </div>
      <nav className="flex shrink-0 border-t" aria-label="Views">
        {bar.map(({ id, title, Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={id === lit ? "page" : undefined}
            onClick={() => onSelect(id)}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs",
              id === lit ? "text-foreground" : "text-muted-foreground",
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
