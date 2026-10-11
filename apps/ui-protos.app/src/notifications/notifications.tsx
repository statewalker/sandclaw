import { Button, cn } from "@statewalker/ui.view.shadcn";
import {
  ArrowLeft,
  Bell,
  BellOff,
  CircleCheck,
  CircleX,
  FileSearch,
  FileWarning,
  Globe,
  Hand,
  type LucideIcon,
  ServerCrash,
  Settings,
  ShieldAlert,
  UserPlus,
  UserX,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GroupPill, type LinkState } from "../group-status/group-status.js";
import { type Role, today } from "../mock.js";
import {
  ago,
  groupRepeats,
  kinds,
  markRead,
  type Notice,
  type NoticeGroup,
  type NoticeKind,
  type NoticeSettings,
  placesFor,
  trim,
  unreadCount,
} from "./inbox.js";
import { NotificationSettings, type OsPermission } from "./notification-settings.js";

/**
 * Where notices are read:
 * - `bell`: a bell in the top bar opens a dropdown list; toasts bottom-right, with an action;
 * - `panel`: the bell opens an Activity side panel next to the documents; one-line toasts,
 *   bottom-centre, only for what needs you.
 */
export type NotificationsVariant = "bell" | "panel";

export interface NotificationsProps {
  variant?: NotificationsVariant;
  viewer?: Role;
  /** Already in the list. */
  notices?: Notice[];
  /** Arriving now: routed to the list and toasts by the settings. */
  arriving?: Notice[];
  settings?: NoticeSettings;
  osPermission?: OsPermission;
  defaultOpen?: boolean;
  link?: LinkState;
  now?: Date;
}

const icons: Record<NoticeKind, LucideIcon> = {
  "task-finished": CircleCheck,
  "task-failed": CircleX,
  "task-waiting": Hand,
  "site-built": Globe,
  "indexing-done": FileSearch,
  "files-unreadable": FileWarning,
  "invite-accepted": UserPlus,
  "invite-declined": UserX,
  "device-added": ShieldAlert,
  "machine-offline": WifiOff,
  "machine-online": Wifi,
  "service-down": ServerCrash,
};

const tone: Partial<Record<NoticeKind, string>> = {
  "task-finished": "text-success",
  "machine-online": "text-success",
  "task-failed": "text-destructive",
  "service-down": "text-destructive",
  "device-added": "text-destructive",
  "machine-offline": "text-destructive",
  "task-waiting": "text-warning",
  "files-unreadable": "text-warning",
};

function KindIcon({ kind, className }: { kind: NoticeKind; className?: string }) {
  const Icon = icons[kind];
  return <Icon aria-hidden className={cn("size-4 shrink-0", tone[kind], className)} />;
}

function NoticeRows({
  groups,
  now,
  onOpen,
}: {
  groups: NoticeGroup[];
  now: Date;
  onOpen: (group: NoticeGroup) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="text-muted-foreground grid place-items-center gap-2 p-8 text-center text-sm">
        <BellOff className="size-6" />
        <p>Nothing new.</p>
        <p className="text-xs">Notices from the last 30 days show here.</p>
      </div>
    );
  }
  return (
    <ul className="overflow-y-auto">
      {groups.map((g) => (
        <li key={g.id} className="border-b last:border-b-0">
          <button
            type="button"
            onClick={() => onOpen(g)}
            className={cn(
              "hover:bg-accent flex w-full gap-3 px-4 py-3 text-left",
              g.unread && "bg-accent/50",
            )}
          >
            <KindIcon kind={g.kind} className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm", g.unread && "font-medium")}>{g.title}</span>
              {g.detail && <span className="text-muted-foreground block text-xs">{g.detail}</span>}
              <span className="text-muted-foreground block text-xs">
                {ago(g.at, now)}
                {kinds[g.kind].action && ` · ${kinds[g.kind].action}`}
              </span>
            </span>
            {g.unread && (
              <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full">
                <span className="sr-only">unread</span>
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Notifications({
  variant = "bell",
  viewer = "admin",
  notices = [],
  arriving = [],
  settings: initialSettings = {},
  osPermission = "default",
  defaultOpen = false,
  link = "connected",
  now = today,
}: NotificationsProps) {
  const forViewer = (n: Notice) => viewer === "admin" || !kinds[n.kind].adminOnly;
  const [settings, setSettings] = useState(initialSettings);
  const [items, setItems] = useState(() =>
    trim(
      [...arriving.filter((n) => placesFor(n.kind, settings).includes("bell")), ...notices].filter(
        forViewer,
      ),
      now,
    ),
  );
  const [toasts, setToasts] = useState(() =>
    arriving
      .filter(forViewer)
      .filter((n) => placesFor(n.kind, settings).includes("toast"))
      .filter((n) => variant === "bell" || kinds[n.kind].urgent),
  );
  const [open, setOpen] = useState(defaultOpen);
  const [seenAt, setSeenAt] = useState<Date | undefined>(defaultOpen ? now : undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [opened, setOpened] = useState("");
  const bellRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const badge = unreadCount(items, seenAt);
  const groups = groupRepeats(items);

  const close = () => {
    setOpen(false);
    setShowSettings(false);
    bellRef.current?.focus();
  };
  const toggle = () => {
    if (open) return close();
    setOpen(true);
    setSeenAt(now);
  };

  // The dropdown closes on Escape and on a click outside it; the side panel only on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        variant === "bell" &&
        !popRef.current?.contains(target) &&
        !bellRef.current?.contains(target)
      )
        close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  });

  const openGroup = (g: NoticeGroup) => {
    const ids = g.notices.map((n) => n.id);
    setItems((all) => markRead(all, ids));
    setToasts((all) => all.filter((t) => !ids.includes(t.id)));
    setOpened(`${kinds[g.kind].action ?? "Open"}: ${g.title}`);
  };

  const list = (
    <>
      <div className="flex items-center gap-2 border-b px-4 py-2">
        {showSettings ? (
          <>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Back to notifications"
              onClick={() => setShowSettings(false)}
            >
              <ArrowLeft />
            </Button>
            <h2 className="mr-auto text-sm font-semibold">Notification settings</h2>
          </>
        ) : (
          <>
            <h2 className="mr-auto text-sm font-semibold">
              {variant === "bell" ? "Notifications" : "Activity"}
            </h2>
            <Button
              size="sm"
              variant="ghost"
              disabled={!groups.some((g) => g.unread)}
              onClick={() => setItems((all) => markRead(all))}
            >
              Mark all read
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Notification settings"
              onClick={() => setShowSettings(true)}
            >
              <Settings />
            </Button>
          </>
        )}
        {variant === "panel" && (
          <Button size="icon" variant="ghost" aria-label="Close activity" onClick={close}>
            <X />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {showSettings ? (
          <NotificationSettings
            viewer={viewer}
            settings={settings}
            onChange={setSettings}
            osPermission={osPermission}
            onClear={() => setItems([])}
          />
        ) : (
          <NoticeRows groups={groups} now={now} onOpen={openGroup} />
        )}
      </div>
    </>
  );

  return (
    // A mock app area: toasts and the dropdown are placed inside it, not in the page.
    <div className="bg-background relative flex h-[600px] w-full max-w-4xl flex-col overflow-hidden rounded-lg border">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <GroupPill state={link} />
        <span className="flex-1" />
        <Button
          ref={bellRef}
          size="icon"
          variant={open ? "secondary" : "ghost"}
          aria-label={badge ? `Notifications, ${badge} new` : "Notifications"}
          aria-expanded={open}
          aria-haspopup={variant === "bell" ? "dialog" : undefined}
          onClick={toggle}
          className="relative"
        >
          <Bell />
          {badge > 0 && (
            <span
              aria-hidden
              className="bg-destructive absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-medium text-white"
            >
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </Button>
      </header>
      <div className="relative flex min-h-0 flex-1">
        <main className="text-muted-foreground grid flex-1 place-items-center p-4 text-center text-xs">
          <div className="grid gap-2">
            <span>Documents</span>
            {opened && (
              <span role="status" className="text-foreground">
                Would open — {opened}
              </span>
            )}
          </div>
        </main>
        {open && variant === "panel" && (
          <aside
            aria-label="Activity"
            className="bg-background absolute inset-0 flex flex-col border-l sm:static sm:w-80"
          >
            {list}
          </aside>
        )}
      </div>
      {open && variant === "bell" && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Notifications"
          className="bg-popover absolute top-12 right-2 left-2 z-10 flex max-h-[480px] flex-col rounded-md border shadow-lg sm:left-auto sm:w-96"
        >
          {list}
        </div>
      )}
      {toasts.length > 0 && (
        <ol
          aria-label="New notifications"
          aria-live="polite"
          className={cn(
            "absolute bottom-3 z-20 grid gap-2",
            variant === "bell"
              ? "right-3 left-3 sm:left-auto sm:w-80"
              : "left-1/2 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2",
          )}
        >
          {groupRepeats(toasts).map((g) => {
            const action = kinds[g.kind].action;
            const dismiss = () =>
              setToasts((all) => all.filter((t) => !g.notices.some((n) => n.id === t.id)));
            return variant === "bell" ? (
              <li key={g.id} className="bg-popover flex gap-3 rounded-md border p-3 shadow-lg">
                <KindIcon kind={g.kind} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{g.title}</p>
                  {g.detail && <p className="text-muted-foreground text-xs">{g.detail}</p>}
                  {action && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7"
                      onClick={() => openGroup(g)}
                    >
                      {action}
                    </Button>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Dismiss"
                  className="size-6"
                  onClick={dismiss}
                >
                  <X />
                </Button>
              </li>
            ) : (
              <li
                key={g.id}
                className="bg-foreground text-background flex items-center gap-2 rounded-full py-1 pr-1 pl-3 text-sm shadow-lg"
              >
                <KindIcon kind={g.kind} className="text-background" />
                <span className="truncate">{g.title}</span>
                {action && (
                  <button
                    type="button"
                    className="hover:bg-background/20 shrink-0 rounded-full px-2 py-0.5 font-medium underline-offset-2"
                    onClick={() => openGroup(g)}
                  >
                    {action}
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Dismiss"
                  className="hover:bg-background/20 shrink-0 rounded-full p-1"
                  onClick={dismiss}
                >
                  <X className="size-3" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
