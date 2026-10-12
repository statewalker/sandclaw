import { Globe } from "lucide-react";
import { Sites } from "../../sites/sites.js";
import { appViewsSlot, menuItem, menuItemsSlot, ShowPanel } from "../contracts.js";
import { all, type Feature } from "../runtime.js";

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
        render: () => <Sites layout="rows" />,
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
