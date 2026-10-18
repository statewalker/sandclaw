import { Commands } from "@statewalker/shared-commands";
import { AppWorkspaceProvider } from "@statewalker/ui.view.react";
import { LoadFileCommand, Workspace } from "@statewalker/workspace.core";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VideoView } from "./video-view.js";

if (typeof URL.createObjectURL === "undefined") {
  let counter = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => `blob:video-test-${++counter}`,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: () => {},
  });
}

describe("VideoView", () => {
  it("renders a <video> with controls and a blob: URL", async () => {
    const ws = new Workspace();
    const commands = ws.requireAdapter(Commands);
    const dispose = commands.listen(LoadFileCommand, (command) => {
      command.resolve({
        path: command.payload.path,
        bytes: new Uint8Array([0x00, 0x00, 0x00, 0x18]),
        mimeType: "video/mp4",
      });
      return true;
    });

    const utils = render(
      <AppWorkspaceProvider workspace={ws}>
        <VideoView uri="file:///x/y.mp4" />
      </AppWorkspaceProvider>,
    );

    const video = await waitFor(() => {
      const el = utils.container.querySelector("video");
      if (!el) throw new Error("video not yet rendered");
      return el;
    });
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.getAttribute("src")?.startsWith("blob:")).toBe(true);

    utils.unmount();
    dispose();
  });
});
