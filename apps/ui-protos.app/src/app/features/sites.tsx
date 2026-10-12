import { Globe } from "lucide-react";
import { Sites } from "../../sites/sites.js";
import { appViewsSlot, menuItem, menuItemsSlot, OpenFile, ShowPanel } from "../contracts.js";
import { all, type Feature, useAppRuntime } from "../runtime.js";

function SitesLinked() {
  const { commands } = useAppRuntime();
  return <Sites layout="rows" onOpenFile={(path) => commands.call(OpenFile, { path })} />;
}

export const sites: Feature = {
  id: "sites",
  label: "Sites",
  contribute: (rt) =>
    all(
      rt.slots.register(appViewsSlot, "sites", {
        id: "sites",
        title: "Sites",
        Icon: Globe,
        zone: "left",
        activity: 30,
        mobile: "more",
        render: () => <SitesLinked />,
      }),
      rt.slots.provide(
        menuItemsSlot,
        menuItem(
          ShowPanel,
          { id: "sites" },
          { id: "view.sites", menu: "View", order: 30, label: "Sites", Icon: Globe },
        ),
      ),
    ),
};
