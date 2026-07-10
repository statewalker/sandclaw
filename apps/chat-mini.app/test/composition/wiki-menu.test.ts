import { menubarItemsSlot } from "@statewalker/app-shell";
import { Slots } from "@statewalker/shared-slots";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { Workspace } from "@statewalker/workspace.core";
import { describe, expect, it } from "vitest";
import initWikiMenu from "../../src/init-wiki-menu.js";

describe("wiki menu in chat-mini.app", () => {
  it("contributes a Wiki menubar entry and removes it on teardown", async () => {
    const workspace = new Workspace().setFileSystem(new MemFilesApi());
    await workspace.open();
    const slots = workspace.requireAdapter(Slots);
    const ctx: Record<string, unknown> = { "workspace:workspace": workspace };

    const cleanup = initWikiMenu(ctx);

    const items = slots.getSnapshot(menubarItemsSlot).filter((i) => i.menu === "Wiki");
    expect(items.map((i) => i.id)).toContain("wiki:ask");

    await cleanup();
    expect(slots.getSnapshot(menubarItemsSlot).some((i) => i.menu === "Wiki")).toBe(false);
  });
});
