import { Intents } from "@statewalker/shared-intents";
import { Slots } from "@statewalker/shared-slots";
import { Workspace } from "@statewalker/workspace-api";
import { describe, expect, it } from "vitest";
import {
  observeSettingsTabs,
  provideSettingsTab,
  runCloseSettings,
  runOpenSettings,
  Settings,
} from "../index.js";
import { SettingsManager } from "./settings.manager.js";

function makeWorkspace(): { ws: Workspace; manager: SettingsManager } {
  const ws = new Workspace();
  ws.setAdapter(Settings);
  const manager = new SettingsManager({ workspace: ws });
  return { ws, manager };
}

describe("SettingsManager", () => {
  it("runOpenSettings flips Settings.isOpen and writes activeTabId", async () => {
    const { ws, manager } = makeWorkspace();
    const intents = ws.requireAdapter(Intents);
    const settings = ws.requireAdapter(Settings);

    expect(settings.isOpen).toBe(false);
    await runOpenSettings(intents, { tabId: "providers" }).promise;
    expect(settings.isOpen).toBe(true);
    expect(settings.activeTabId).toBe("providers");

    await manager.close();
  });

  it("runCloseSettings flips Settings.isOpen back", async () => {
    const { ws, manager } = makeWorkspace();
    const intents = ws.requireAdapter(Intents);
    const settings = ws.requireAdapter(Settings);

    await runOpenSettings(intents, {}).promise;
    expect(settings.isOpen).toBe(true);
    await runCloseSettings(intents).promise;
    expect(settings.isOpen).toBe(false);

    await manager.close();
  });

  it("setActiveTab notifies subscribers", () => {
    const { ws, manager } = makeWorkspace();
    const settings = ws.requireAdapter(Settings);
    let updates = 0;
    const dispose = settings.onUpdate(() => {
      updates += 1;
    });

    settings.setActiveTab("providers");
    expect(settings.activeTabId).toBe("providers");
    expect(updates).toBe(1);

    // Same id → no-op, no notify.
    settings.setActiveTab("providers");
    expect(updates).toBe(1);

    dispose();
    void manager.close();
  });

  it("settings:tabs slot accepts contributions from any fragment", () => {
    const { ws, manager } = makeWorkspace();
    const slots = ws.requireAdapter(Slots);

    let observed: ReadonlyArray<{ id: string }> = [];
    const stop = observeSettingsTabs(slots, (vs) => {
      observed = vs;
    });

    const dispose = provideSettingsTab(slots, {
      id: "test-tab",
      title: "Test",
      viewKey: "test:view",
    });
    expect(observed.map((t) => t.id)).toContain("test-tab");

    dispose();
    expect(observed.map((t) => t.id)).not.toContain("test-tab");

    stop();
    void manager.close();
  });
});
