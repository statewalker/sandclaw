import { FileText } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import {
  appViewsSlot,
  menuItem,
  menuItemsSlot,
  OpenSettings,
  ShowPanel,
} from "../src/app/contracts.js";
import { all, contributeAll, createRuntime, type Feature, handle } from "../src/app/runtime.js";

const keys = (rt: ReturnType<typeof createRuntime>) => rt.handled.list().map((d) => d.key);

describe("App runtime", () => {
  it("a menu item runs its command through the handler a feature registered", async () => {
    const rt = createRuntime();
    const seen: unknown[] = [];
    const stop = handle(rt, OpenSettings, (payload) => seen.push(payload));
    menuItem(OpenSettings, { section: "me" }, { id: "x", menu: "File", label: "X" }).run(
      rt.commands,
    );
    await vi.waitFor(() => expect(seen).toEqual([{ section: "me" }]));
    expect(keys(rt)).toContain("settings:open");
    stop();
    expect(keys(rt)).not.toContain("settings:open");
  });

  it("disposing the features takes back every contribution and handler", () => {
    const rt = createRuntime();
    const feature: Feature = {
      id: "f",
      label: "F",
      contribute: (rt) =>
        all(
          rt.slots.register(appViewsSlot, "report", {
            id: "report",
            title: "Report",
            Icon: FileText,
            zone: "center",
            render: () => null,
          }),
          rt.slots.provide(
            menuItemsSlot,
            menuItem(ShowPanel, { id: "report" }, { id: "report", menu: "View", label: "Report" }),
          ),
          handle(rt, ShowPanel, () => {}),
        ),
    };
    const dispose = contributeAll(rt, [feature], {
      viewer: "admin",
      commander: { current: null },
    });
    expect(rt.slots.getSnapshot(appViewsSlot).size).toBe(1);
    expect(rt.slots.getSnapshot(menuItemsSlot)).toHaveLength(1);
    expect(keys(rt)).toContain("dock:show-panel");
    dispose();
    expect(rt.slots.getSnapshot(appViewsSlot).size).toBe(0);
    expect(rt.slots.getSnapshot(menuItemsSlot)).toHaveLength(0);
    expect(keys(rt)).not.toContain("dock:show-panel");
  });
});
