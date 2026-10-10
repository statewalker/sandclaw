import { Button, cn } from "@statewalker/ui.view.shadcn";
import { Lock } from "lucide-react";
import { useState } from "react";
import type { Role } from "../mock.js";
import {
  type Channel,
  channelOf,
  KEEP_DAYS,
  KEEP_MAX,
  kindList,
  kinds,
  type NoticeSettings,
  type Section,
  setChannel,
} from "./inbox.js";

/** The browser's answer to "may Sandclaw show notifications?" (`Notification.permission`). */
export type OsPermission = "default" | "granted" | "denied";

export interface NotificationSettingsProps {
  viewer?: Role;
  settings?: NoticeSettings;
  onChange?: (settings: NoticeSettings) => void;
  osPermission?: OsPermission;
  /** Clears the list kept in this browser; the button shows only when given. */
  onClear?: () => void;
}

const channels: [Channel, string][] = [
  ["bell-toast", "Bell + toast"],
  ["bell", "Bell only"],
  ["off", "Off"],
];

const sections: Section[] = ["Tasks", "Sites and files", "Machine", "Team", "Security"];

function OsNotifications({ initial }: { initial: OsPermission }) {
  // The prototype answers "allow" itself; the app calls `Notification.requestPermission()`.
  const [permission, setPermission] = useState(initial);
  return (
    <section className="grid gap-2 border-b p-4">
      <h3 className="text-sm font-medium">When this tab is in the background</h3>
      {permission === "default" && (
        <>
          <p className="text-muted-foreground text-sm">
            Toasts are missed while you look at another tab. Let this browser show them as system
            notifications instead.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="justify-self-start"
            onClick={() => setPermission("granted")}
          >
            Allow browser notifications
          </Button>
        </>
      )}
      {permission === "granted" && (
        <p className="text-sm">
          <span className="bg-success mr-2 inline-block size-2 rounded-full" />
          On: what would be a toast shows as a system notification while the tab is in the
          background.
        </p>
      )}
      {permission === "denied" && (
        <p className="text-sm">
          <span className="bg-destructive mr-2 inline-block size-2 rounded-full" />
          Blocked in this browser. Toasts wait for you to come back to the tab. To allow, open the
          site settings next to the address bar.
        </p>
      )}
    </section>
  );
}

/** Per-kind choice of where notices show, the browser permission, and what is kept. */
export function NotificationSettings({
  viewer = "admin",
  settings: initial = {},
  onChange,
  osPermission = "default",
  onClear,
}: NotificationSettingsProps) {
  const [settings, setSettings] = useState(initial);
  const change = (next: NoticeSettings) => {
    setSettings(next);
    onChange?.(next);
  };
  const shown = kindList.filter((k) => viewer === "admin" || !kinds[k].adminOnly);

  return (
    <div className="grid">
      <OsNotifications initial={osPermission} />
      {sections.map((section) => {
        const own = shown.filter((k) => kinds[k].section === section);
        if (own.length === 0) return null;
        return (
          <section key={section} className="border-b p-4">
            <h3 className="mb-2 text-sm font-medium">{section}</h3>
            <div className="grid gap-3">
              {own.map((kind) => {
                const info = kinds[kind];
                const current = channelOf(kind, settings);
                return (
                  <fieldset
                    key={kind}
                    disabled={info.locked}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
                  >
                    <legend className="float-left text-sm">{info.label}</legend>
                    <div className="bg-secondary flex rounded-md p-0.5">
                      {channels.map(([channel, label]) => (
                        <label
                          key={channel}
                          className={cn(
                            "rounded px-2 py-1 text-xs has-[:focus-visible]:ring-2",
                            current === channel
                              ? "bg-background shadow-sm"
                              : "text-muted-foreground",
                            info.locked ? "cursor-not-allowed" : "cursor-pointer",
                          )}
                        >
                          <input
                            type="radio"
                            name={`notify-${kind}`}
                            className="sr-only"
                            checked={current === channel}
                            onChange={() => change(setChannel(settings, kind, channel))}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {info.locked && (
                      <p className="text-muted-foreground flex w-full items-center gap-1 text-xs">
                        <Lock className="size-3" /> Always shown: someone may be using your
                        identity.
                      </p>
                    )}
                  </fieldset>
                );
              })}
            </div>
          </section>
        );
      })}
      <section className="text-muted-foreground flex flex-wrap items-center gap-2 p-4 text-xs">
        <p className="flex-1">
          Kept in this browser only: the last {KEEP_DAYS} days, at most {KEEP_MAX} notices. Your
          other devices keep their own list.
        </p>
        {onClear && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear the list
          </Button>
        )}
      </section>
    </div>
  );
}
