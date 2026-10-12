import { FileSearch, Search } from "lucide-react";
import { IndexExplorer } from "../../explore/explore.js";
import { IndexingPage, IndexingTree } from "../../indexing/indexing.js";
import { appViewsSlot, menuItem, menuItemsSlot, ShowPanel } from "../contracts.js";
import { all, type Feature, provideAll, registerAll, settingsTab } from "../runtime.js";
import { PanelPage } from "../shell/panel-page.js";

export const indexing: Feature = {
  id: "indexing",
  label: "Indexing and search",
  contribute: (rt) =>
    all(
      registerAll(rt.slots, appViewsSlot, [
        {
          id: "indexing",
          title: "Indexing",
          Icon: FileSearch,
          zone: "left",
          activity: 40,
          mobile: "more",
          render: () => <IndexingTree />,
        },
        {
          id: "explore",
          title: "Explore the indexes",
          Icon: Search,
          zone: "center",
          mobile: "more",
          render: () => (
            <PanelPage>
              <IndexExplorer />
            </PanelPage>
          ),
        },
      ]),
      provideAll(rt.slots, menuItemsSlot, [
        menuItem(
          ShowPanel,
          { id: "indexing" },
          { id: "view.indexing", menu: "View", order: 40, label: "Indexing", Icon: FileSearch },
        ),
        menuItem(
          ShowPanel,
          { id: "explore" },
          { id: "edit.find", menu: "Edit", order: 60, label: "Find in files…", Icon: Search },
        ),
      ]),
      settingsTab(rt.slots, "indexing", 80, () => <IndexingPage />),
    ),
};
