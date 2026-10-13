import "dockview-react/dist/styles/dockview.css";
import "../../workspace-layout/workspace.css";
import { Button, cn } from "@statewalker/ui.view.shadcn";
import {
  type DockviewApi,
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type SerializedDockview,
} from "dockview-react";
import { Settings as SettingsIcon, X } from "lucide-react";
import { createContext, useContext, useEffect, useReducer, useRef, useState } from "react";
import {
  FilesInDock,
  fileContributions,
  fileDockComponents,
  fileTabComponents,
  useFilesInDock,
} from "../../file-panels/dock-files.js";
import { type Commander, useCommander } from "../../file-panels/use-commander.js";
import { SettingsDialog } from "../../settings/settings.js";
import { DOCK_THEME } from "../../workspace-layout/dock-theme.js";
import { MissingPanel } from "../../workspace-layout/panels.js";
import { type Mode, modeFor, usesDock } from "../../workspace-layout/responsive.js";
import { keepSideSizes, loadSavedLayout, syncZones } from "../../workspace-layout/zones.js";
import {
  type AppLayoutId,
  ApplyLayout,
  type AppMenuItem,
  type AppTheme,
  type AppView,
  appViewsSlot,
  ClosePanel,
  headerItemsSlot,
  menuItemsSlot,
  OpenSettings,
  overlaysSlot,
  SetTheme,
  ShowPanel,
  settingsTabsSlot,
} from "../contracts.js";
import {
  all,
  handle,
  ThemeContext,
  useAppRuntime,
  useKeyedSlotValues,
  useSlotValues,
} from "../runtime.js";
import { FOLDER_MOUNT, newAppStorages } from "../world.js";
import {
  byActivity,
  isShownLeft,
  layoutSides,
  showView,
  startingViews,
  toggleLeft,
  VIEW,
} from "./app-dock.js";
import { buildMenus, isTyping, matchesShortcut } from "./menu-model.js";
import { AppMenubar } from "./menubar.js";
import { PhoneMenu } from "./phone-menu.js";
import { PhoneStack } from "./phone-stack.js";

const MISSING = "missing";
// HTML5 drag and drop is unreliable on touch screens, so the dock does not offer it there.
const coarsePointer = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
/** What a saved layout may hold: App views and the file panels' own components. */
const KNOWN = [{ id: VIEW, title: "", component: VIEW, targets: [] }, ...fileContributions];
/** The file panels the App opens with: the Files tree (out of the dock) and two panels. */
const START_PANELS = [
  { path: FOLDER_MOUNT, view: "tree" as const, dock: false as const },
  `${FOLDER_MOUNT}/Clients`,
  `${FOLDER_MOUNT}/Finance`,
];

const ViewsContext = createContext<ReadonlyMap<string, AppView>>(new Map());

/** Every App view on the dock sits in a size container: its content follows the panel's width. */
function ViewPanel({ api }: IDockviewPanelProps) {
  const view = useContext(ViewsContext).get(api.id);
  return <div className="@container h-full overflow-auto">{view?.render()}</div>;
}

const components = { [VIEW]: ViewPanel, ...fileDockComponents, [MISSING]: MissingPanel };

function ActivityBar({
  views,
  pressed,
  onToggle,
  onSettings,
}: {
  views: AppView[];
  pressed(id: string): boolean;
  onToggle(view: AppView): void;
  onSettings(): void;
}) {
  return (
    <nav
      aria-label="Activity bar"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2"
    >
      {views.map((v) => (
        <Button
          key={v.id}
          variant={pressed(v.id) ? "secondary" : "ghost"}
          size="icon"
          aria-label={v.title}
          aria-pressed={pressed(v.id)}
          title={v.title}
          onClick={() => onToggle(v)}
        >
          <v.Icon />
        </Button>
      ))}
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Settings"
        title="Settings"
        onClick={onSettings}
      >
        <SettingsIcon />
      </Button>
    </nav>
  );
}

export interface AppShellProps {
  /** Set to the shell's commander on each render, for the features' file commands. */
  commanderRef: { current: Commander | null };
  /** The mode before the shell has measured itself; it then follows its own width. */
  initialMode?: Mode;
}

/**
 * The App: menus and header items on top; on a desktop the activity bar and
 * the dock (file panels in the center, the views around them); on a tablet
 * the side views as overlays; on a phone one view at a time. Everything it
 * shows comes from the slots; it handles the dock, Settings, layout and theme
 * commands.
 */
export function AppShell({ commanderRef, initialMode = "desktop" }: AppShellProps) {
  const rt = useAppRuntime();
  const viewMap = useKeyedSlotValues(appViewsSlot);
  const views = [...viewMap.values()];
  const viewsRef = useRef(views);
  viewsRef.current = views;
  const menuItems = useSlotValues(menuItemsSlot);
  const itemsRef = useRef(menuItems);
  itemsRef.current = menuItems;
  const menus = buildMenus(menuItems);
  const header = [...useSlotValues(headerItemsSlot)].sort((a, b) => a.order - b.order);
  const overlays = useSlotValues(overlaysSlot);
  const tabs = [...useKeyedSlotValues(settingsTabsSlot).values()].sort((a, b) => a.order - b.order);

  const [storages] = useState(newAppStorages);
  const commander = useCommander({ storages, panels: START_PANELS });
  commanderRef.current = commander;

  const root = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const modeRef = useRef<Mode>(initialMode);
  const api = useRef<DockviewApi | null>(null);
  const [dockApi, setDockApi] = useState<DockviewApi | null>(null);
  const filesDock = useFilesInDock(commander, dockApi, { phone: coarsePointer });
  // Read through a ref: a re-layout must re-add the file panels the commander has now.
  const filesDockRef = useRef(filesDock);
  filesDockRef.current = filesDock;
  // The user's arrangement of each dock mode, kept while the screen changes size.
  const savedLayouts = useRef(new Map<Mode, SerializedDockview>());
  const arrangedFor = useRef<Mode | undefined>(undefined);
  const layoutId = useRef<AppLayoutId>("assistant");
  const disposers = useRef<Array<() => void>>([]);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [overlay, setOverlay] = useState<string | null>(null);
  const [phoneView, setPhoneView] = useState("files");
  const [settings, setSettings] = useState<{ open: boolean; section?: string }>({ open: false });
  const lastSection = useRef<string | undefined>(undefined);
  const [theme, setTheme] = useState<AppTheme>("system");

  /** Lays the dock out for `target`: the arrangement saved for it, or from scratch. */
  const arrange = (target: Mode) => {
    const dock = api.current;
    if (!dock) return;
    const saved = savedLayouts.current.get(target);
    filesDockRef.current.relayout(() => {
      if (saved) loadSavedLayout(dock, saved, KNOWN, MISSING);
      else dock.clear();
    });
    if (!saved) {
      layoutSides(dock, startingViews(viewsRef.current, layoutId.current, target === "compact"));
    }
    arrangedFor.current = target;
    syncZones(dock, () => "hover");
    refresh();
  };

  const disposeDock = () => {
    for (const dispose of disposers.current) dispose();
    disposers.current = [];
  };

  const onReady = (event: DockviewReadyEvent) => {
    disposeDock();
    api.current = event.api;
    setDockApi(event.api);
    const subscriptions = [
      event.api.onDidLayoutChange(() => {
        syncZones(event.api, () => "hover");
        refresh();
      }),
      event.api.onDidActivePanelChange(() => refresh()),
    ];
    disposers.current.push(() => {
      for (const s of subscriptions) s.dispose();
    });
    disposers.current.push(keepSideSizes(event.api));
  };

  const switchMode = (next: Mode) => {
    const previous = modeRef.current;
    if (next === previous) return;
    // Saved before the dock may unmount (the phone has no dock).
    if (api.current && usesDock(previous)) savedLayouts.current.set(previous, api.current.toJSON());
    if (!usesDock(next)) {
      disposeDock();
      api.current = null;
      setDockApi(null);
      arrangedFor.current = undefined;
    }
    modeRef.current = next;
    setOverlay(null);
    setMode(next);
  };

  // The shell follows its own width, not the viewport's.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      if (width > 0) switchMode(modeFor(width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // On a phone, an opened file shows full screen in Files, whatever view was shown;
  // a revealed file shows in its panel there.
  useEffect(() => {
    if (mode === "mobile" && commander.viewer) setPhoneView("files");
  }, [mode, commander.viewer]);
  useEffect(() => {
    if (modeRef.current === "mobile" && commander.revealed) setPhoneView("files");
  }, [commander.revealed]);

  // A new dock, or desktop ↔ compact on the same dock (no remount): lay it out for the
  // mode. Not from `onReady`: the file panels go back on the dock through `useFilesInDock`,
  // which reaches a new dock only once `dockApi` has rendered.
  useEffect(() => {
    if (usesDock(mode) && dockApi && arrangedFor.current !== mode) arrange(mode);
  }, [mode, dockApi]);

  useEffect(() => disposeDock, []);

  // "System" leaves the page's own theme alone; light and dark set it while the App is shown.
  useEffect(() => {
    if (theme === "system") return;
    const el = document.documentElement;
    const before = el.classList.contains("dark");
    el.classList.toggle("dark", theme === "dark");
    return () => {
      el.classList.toggle("dark", before);
    };
  }, [theme]);

  const show = (id: string) => {
    const view = viewsRef.current.find((v) => v.id === id);
    if (!view) return;
    const current = modeRef.current;
    if (current === "mobile") setPhoneView(id);
    else if (current === "compact" && (view.zone === "left" || view.zone === "right")) {
      setOverlay(id);
    } else if (api.current) {
      showView(api.current, view);
      refresh();
    }
  };

  const openSettings = (section?: string) => {
    const target = section ?? lastSection.current;
    lastSection.current = target;
    setSettings({ open: true, section: target });
  };

  useEffect(
    () =>
      all(
        handle(rt, ShowPanel, ({ id }) => show(id)),
        handle(rt, ClosePanel, ({ id }) => {
          const dock = api.current;
          const panel = dock && (id ? dock.getPanel(id) : dock.activePanel);
          if (dock && panel) dock.removePanel(panel);
        }),
        handle(rt, OpenSettings, ({ section }) => openSettings(section)),
        handle(rt, ApplyLayout, ({ id }) => {
          layoutId.current = id;
          const current = modeRef.current;
          if (!usesDock(current)) return;
          savedLayouts.current.delete(current);
          arrange(current);
        }),
        handle(rt, SetTheme, ({ theme }) => setTheme(theme)),
      ),
    [rt],
  );

  // Menu shortcuts. A key a panel or a text field already handled is theirs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e)) return;
      // Behind a modal layer (Settings, a dialog, the lock, the phone menu) the shortcuts are
      // off. Radix does not set aria-modal, so an open dialog is told by its data-state; the
      // bell's non-modal popover has none.
      if (
        document.querySelector(
          '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]',
        )
      )
        return;
      const item = itemsRef.current.find((i) => i.shortcut && matchesShortcut(i.shortcut, e));
      if (!item) return;
      e.preventDefault();
      item.run(rt.commands);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rt]);

  // A compact overlay closes on Escape.
  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOverlay(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay]);

  const run = (item: AppMenuItem) => item.run(rt.commands);
  const activityViews = views.filter((v) => v.zone === "left" && v.activity !== undefined);
  const barViews =
    mode === "compact"
      ? [
          ...activityViews.sort(byActivity),
          ...views.filter((v) => v.zone === "right").sort(byActivity),
        ]
      : activityViews.sort(byActivity);
  const pressed = (id: string) =>
    mode === "compact" ? overlay === id : !!dockApi && isShownLeft(dockApi, id);
  const toggle = (view: AppView) => {
    if (mode === "compact") setOverlay(overlay === view.id ? null : view.id);
    else if (api.current) {
      toggleLeft(api.current, view);
      refresh();
    }
  };
  const overlayView = views.find((v) => v.id === overlay);
  const phoneTitle =
    phoneView === "files"
      ? "Files"
      : phoneView === "more"
        ? "More"
        : (views.find((v) => v.id === phoneView)?.title ?? "");

  return (
    <ThemeContext.Provider value={theme}>
      <ViewsContext.Provider value={viewMap}>
        <FilesInDock.Provider value={filesDock}>
          <div
            ref={root}
            data-mode={mode}
            className="bg-background text-foreground relative flex h-full min-h-0 flex-col"
          >
            <header className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
              {mode === "mobile" ? (
                <>
                  <PhoneMenu menus={menus} onRun={run} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{phoneTitle}</span>
                </>
              ) : (
                <>
                  <AppMenubar menus={menus} onRun={run} />
                  <span className="flex-1" />
                </>
              )}
              {header.map(({ id, Component }) => (
                <Component key={id} />
              ))}
            </header>
            {mode === "mobile" ? (
              <PhoneStack
                views={views}
                current={phoneView}
                onSelect={setPhoneView}
                commander={commander}
              />
            ) : (
              <div className="flex min-h-0 flex-1">
                <ActivityBar
                  views={barViews}
                  pressed={pressed}
                  onToggle={toggle}
                  onSettings={() => openSettings()}
                />
                <div className="relative min-h-0 min-w-0 flex-1">
                  <DockviewReact
                    theme={DOCK_THEME}
                    className="dockview-theme-light dockview-theme-sandclaw absolute inset-0 isolate"
                    components={components}
                    tabComponents={fileTabComponents}
                    onReady={onReady}
                    disableDnd={coarsePointer}
                    disableFloatingGroups
                  />
                  {overlayView && (
                    <>
                      <button
                        type="button"
                        aria-label="Close panel"
                        className="absolute inset-0 z-10 bg-black/20"
                        onClick={() => setOverlay(null)}
                      />
                      <aside
                        aria-label={overlayView.title}
                        className={cn(
                          "bg-background absolute inset-y-0 z-20 flex w-[min(360px,85%)] flex-col shadow-xl",
                          overlayView.zone === "right" ? "right-0 border-l" : "left-0 border-r",
                        )}
                      >
                        <div className="flex h-10 shrink-0 items-center justify-between border-b px-3 text-sm font-medium">
                          {overlayView.title}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Close"
                            onClick={() => setOverlay(null)}
                          >
                            <X />
                          </Button>
                        </div>
                        <div className="@container min-h-0 flex-1 overflow-auto">
                          {overlayView.render()}
                        </div>
                      </aside>
                    </>
                  )}
                </div>
              </div>
            )}
            {commander.noticeBar}
            {commander.progressStrip}
            {commander.dialogs}
            <SettingsDialog
              open={settings.open}
              onOpenChange={(open) => setSettings((s) => ({ ...s, open }))}
              entries={tabs}
              section={settings.section}
              onSectionChange={(id) => {
                lastSection.current = id;
              }}
              phone={mode === "mobile"}
            />
            {overlays.map(({ id, Component }) => (
              <Component key={id} />
            ))}
          </div>
        </FilesInDock.Provider>
      </ViewsContext.Provider>
    </ThemeContext.Provider>
  );
}
