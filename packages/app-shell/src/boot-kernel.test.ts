import {
  callCommand,
  defineConfig,
  fragmentsSlot,
  getConfig,
  getSlots,
  handleCommand,
} from "@statewalker/kernel.core";
import initPlatformNode from "@statewalker/platform.node";
import { Command, Commands, passthrough } from "@statewalker/shared-commands";
import { defineSlot, Slots } from "@statewalker/shared-slots";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { type BootHeadlessOptions, bootHeadless } from "./boot-headless.js";
import { SUBSTRATE } from "./substrate-ids.js";

function boot(options: Omit<BootHeadlessOptions, "platform" | "files"> = {}) {
  return bootHeadless({
    ...options,
    files: new MemFilesApi(),
    platform: (ctx) => initPlatformNode(ctx, { preferences: new MemFilesApi() }),
  });
}

const Echo = Command.async("test:echo")
  .input(passthrough<{ text: string }>())
  .output(passthrough<string>())
  .build();

describe("bootHeadless on the kernel", () => {
  it("activates the logic substrate under its SUBSTRATE ids", async () => {
    const { kernel, ready, cleanup } = boot();
    await ready;
    for (const id of [SUBSTRATE.platform, SUBSTRATE.dock, SUBSTRATE.workspace, SUBSTRATE.mime]) {
      expect(kernel.get(id)?.status).toBe("active");
    }
    await cleanup();
  });

  it("gives workspace adapters and context adapters the same buses", async () => {
    const { ctx, workspace, cleanup } = boot();
    expect(workspace.requireAdapter(Slots)).toBe(getSlots(ctx));
    handleCommand(ctx, Echo, ({ text }) => text);
    await expect(
      workspace.requireAdapter(Commands).call(Echo, { text: "hi" }).promise,
    ).resolves.toBe("hi");
    await cleanup();
  });

  it("orders app fragments by `requires`, after the substrate, with config from the host", async () => {
    const log: string[] = [];
    const greeting = defineConfig("greeting", { text: "hello" });
    const { ctx, ready, cleanup } = boot({
      config: { greeting: { text: "bonjour" } },
      fragments: [
        {
          id: "app.ui",
          requires: ["app.service"],
          activate: (c) => {
            log.push(`ui:${getConfig(c, greeting).text}`);
          },
        },
        {
          id: "app.service",
          requires: [SUBSTRATE.dock],
          activate: (c) => {
            log.push("service");
            return handleCommand(c, Echo, ({ text }) => text.toUpperCase());
          },
        },
      ],
    });
    await ready;
    expect(log).toEqual(["service", "ui:bonjour"]);
    await expect(callCommand(ctx, Echo, { text: "x" })).resolves.toBe("X");
    await cleanup();
  });

  it("loads and unloads plugins at runtime", async () => {
    const panels = defineSlot<string>("test:panels");
    const { ctx, kernel, cleanup } = boot();
    await kernel.load({
      id: "plugin",
      load: async () => ({ default: (c) => getSlots(c).provide(panels, "plugin-panel") }),
    });
    expect(getSlots(ctx).getSnapshot(panels)).toEqual(["plugin-panel"]);
    expect(getSlots(ctx).getSnapshot(fragmentsSlot).get("plugin")?.status).toBe("active");
    await kernel.unload("plugin");
    expect(getSlots(ctx).getSnapshot(panels)).toEqual([]);
    await cleanup();
  });
});
