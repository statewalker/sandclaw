import { Commands } from "@statewalker/shared-commands";
import { AppWorkspaceProvider } from "@statewalker/ui.view.react";
import { LoadFileCommand, Workspace } from "@statewalker/workspace.core";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PdfView } from "./pdf-view.js";

if (typeof URL.createObjectURL === "undefined") {
  let counter = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => `blob:pdf-test-${++counter}`,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: () => {},
  });
}

describe("PdfView", () => {
  it("renders an <embed> with type=application/pdf and a blob: URL", async () => {
    const ws = new Workspace();
    const commands = ws.requireAdapter(Commands);
    const dispose = commands.listen(LoadFileCommand, (command) => {
      command.resolve({
        path: command.payload.path,
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        mimeType: "application/pdf",
      });
      return true;
    });

    const utils = render(
      <AppWorkspaceProvider workspace={ws}>
        <PdfView uri="file:///x/y.pdf" />
      </AppWorkspaceProvider>,
    );

    const embed = await waitFor(() => {
      const el = utils.container.querySelector("embed");
      if (!el) throw new Error("embed not yet rendered");
      return el;
    });
    expect(embed.getAttribute("type")).toBe("application/pdf");
    expect(embed.getAttribute("src")?.startsWith("blob:")).toBe(true);

    utils.unmount();
    dispose();
  });
});
