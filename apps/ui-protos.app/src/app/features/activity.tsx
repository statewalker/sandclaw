import { Card } from "@statewalker/ui.view.shadcn";
import { ListChecks } from "lucide-react";
import type { Role } from "../../mock.js";
import type { NoticeTarget } from "../../notifications/inbox.js";
import { history } from "../../notifications/notices-mock.js";
import { NotificationSettings } from "../../notifications/notification-settings.js";
import { Notifications } from "../../notifications/notifications.js";
import { TasksStrip } from "../../tasks/tasks-strip.js";
import {
  appViewsSlot,
  headerItemsSlot,
  menuItem,
  menuItemsSlot,
  OpenFile,
  OpenSettings,
  ShowPanel,
} from "../contracts.js";
import { all, type Feature, settingsTab, useAppRuntime } from "../runtime.js";

/** The bell: opening a notice goes where it points. */
function Bell({ viewer }: { viewer: Role }) {
  const { commands } = useAppRuntime();
  const go = (target: NoticeTarget) => {
    if (target.kind === "file") commands.call(OpenFile, { path: target.path });
    else if (target.kind === "settings") commands.call(OpenSettings, { section: target.section });
    else commands.call(ShowPanel, { id: target.kind === "site" ? "sites" : "team" });
  };
  return <Notifications embedded viewer={viewer} notices={history} onOpen={go} />;
}

/** What runs and what happened: the Tasks strip at the bottom, the bell on top. */
export const activity: Feature = {
  id: "activity",
  label: "Tasks and notifications",
  contribute: (rt, ctx) =>
    all(
      rt.slots.register(appViewsSlot, "tasks", {
        id: "tasks",
        title: "Tasks",
        Icon: ListChecks,
        zone: "bottom",
        mobile: "tab",
        render: () => <TasksStrip scenario="everything" />,
      }),
      rt.slots.provide(headerItemsSlot, {
        id: "bell",
        order: 20,
        Component: () => <Bell viewer={ctx.viewer} />,
      }),
      rt.slots.provide(
        menuItemsSlot,
        menuItem(
          ShowPanel,
          { id: "tasks" },
          { id: "view.tasks", menu: "View", order: 60, label: "Tasks", Icon: ListChecks },
        ),
      ),
      settingsTab(rt.slots, "notifications", 30, () => (
        <Card className="w-full max-w-2xl gap-0 py-0">
          <h2 className="border-b p-4 font-semibold">Notifications</h2>
          <NotificationSettings viewer={ctx.viewer} />
        </Card>
      )),
    ),
};
