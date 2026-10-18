import { Commands } from "@statewalker/shared-commands";
import { AppWorkspaceProvider } from "@statewalker/ui.view.react";
import { LoadFileCommand, Workspace } from "@statewalker/workspace.core";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImageView } from "./image-view.js";

if (typeof URL.createObjectURL === "undefined") {
  let counter = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => `blob:image-test-${++counter}`,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: () => {},
  });
}

describe("ImageView", () => {
  it("renders an <img> with a blob: URL after the file loads", async () => {
    const ws = new Workspace();
    const commands = ws.requireAdapter(Commands);
    const dispose = commands.listen(LoadFileCommand, (command) => {
      command.resolve({
        path: command.payload.path,
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        mimeType: "image/png",
      });
      return true;
    });

    const utils = render(
      <AppWorkspaceProvider workspace={ws}>
        <ImageView uri="file:///x/y.png" />
      </AppWorkspaceProvider>,
    );

    const img = await waitFor(() => {
      const el = utils.container.querySelector("img");
      if (!el) throw new Error("img not yet rendered");
      return el;
    });
    expect(img.getAttribute("src")?.startsWith("blob:")).toBe(true);

    utils.unmount();
    dispose();
  });
});
