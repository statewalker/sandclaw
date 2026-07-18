import {
  getCommands,
  PreferenceGetCommand,
  PreferenceSetCommand,
} from "@statewalker/platform.core";
import initPlatformNode from "@statewalker/platform.node";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { type BootHeadlessOptions, bootHeadless } from "./boot-shell.js";

/**
 * bootHeadless with in-memory preferences so the test never touches the real
 * host config dir (`initPlatformNode`'s default is a NodeFilesApi at ~/.config).
 */
function bootHeadlessMem(
  options: Omit<BootHeadlessOptions, "platform">,
): ReturnType<typeof bootHeadless> {
  return bootHeadless({
    ...options,
    platform: (ctx) => initPlatformNode(ctx, { preferences: new MemFilesApi() }),
  });
}

/**
 * Smoke test for the isomorphic split: `bootHeadless` must boot the logic
 * substrate under Node — no DOM, no React — and expose a working `Workspace`
 * + `platform:*` surface. This is the runtime proof that the substrate the
 * browser `bootShell` shares is genuinely host-agnostic.
 */
describe("bootHeadless", () => {
  it("boots the substrate headlessly and opens the workspace against the given FilesApi", async () => {
    const files = new MemFilesApi();
    const { workspace, cleanup } = bootHeadlessMem({ files });

    // bootHeadless opens eagerly (fire-and-forget); await the transition.
    await new Promise<void>((resolve) => {
      if (workspace.isOpened) return resolve();
      workspace.onLoad(() => resolve());
    });

    expect(workspace.isOpened).toBe(true);
    expect(workspace.files).toBe(files);

    await cleanup();
    expect(workspace.isOpened).toBe(false);
  });

  it("round-trips platform:preference through initPlatformNode", async () => {
    const { ctx, cleanup } = bootHeadlessMem({ files: new MemFilesApi() });
    const commands = getCommands(ctx);

    await commands.call(PreferenceSetCommand, { key: "theme", value: "dark" }).promise;
    const got = await commands.call(PreferenceGetCommand, { key: "theme" }).promise;

    expect(got.value).toBe("dark");

    // Absent key resolves to undefined, not a rejection.
    const missing = await commands.call(PreferenceGetCommand, { key: "nope" }).promise;
    expect(missing.value).toBeUndefined();

    await cleanup();
  });
});
