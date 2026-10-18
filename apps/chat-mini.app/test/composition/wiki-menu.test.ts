import { actionsSlot, createAppContext, getSlots } from "@statewalker/kernel.core";
import { describe, expect, it } from "vitest";
import { NewChatSessionCommand } from "../../src/init-new-session.js";
import initWikiMenu from "../../src/init-wiki-menu.js";

describe("wiki menu in chat-mini.app", () => {
  it("contributes a Wiki action over chat-mini:new-session and removes it on teardown", () => {
    const ctx = createAppContext();
    const slots = getSlots(ctx);

    const cleanup = initWikiMenu(ctx);

    const actions = slots.getSnapshot(actionsSlot).filter((a) => a.menu === "Wiki");
    expect(actions.map((a) => a.id)).toEqual(["wiki:ask"]);
    expect(actions[0]?.command).toBe(NewChatSessionCommand);

    cleanup();
    expect(slots.getSnapshot(actionsSlot).some((a) => a.menu === "Wiki")).toBe(false);
  });
});
