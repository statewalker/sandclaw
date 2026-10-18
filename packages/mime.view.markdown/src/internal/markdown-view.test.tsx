import { Commands } from "@statewalker/shared-commands";
import { AppWorkspaceProvider } from "@statewalker/ui.view.react";
import { LoadFileCommand, Workspace } from "@statewalker/workspace.core";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownView } from "./markdown-view.js";

// shiki is stubbed so a "ready" markdown body highlights deterministically.
vi.mock("shiki", () => ({
  codeToHtml: async () => "<pre><code>x</code></pre>",
}));

function mount(ws: Workspace, ui: ReactElement) {
  return render(<AppWorkspaceProvider workspace={ws}>{ui}</AppWorkspaceProvider>);
}

// MarkdownView is a public catalog-bound component; its load/error/uri-strip
// state machine is tested directly with LoadFileCommand as the mocked
// collaborator (Pattern B).
describe("MarkdownView state machine", () => {
  it("shows the loading placeholder before the file resolves", () => {
    const ws = new Workspace();
    const commands = ws.requireAdapter(Commands);
    // claim but never settle → stays loading
    const dispose = commands.listen(LoadFileCommand, () => true);

    const { getByText } = mount(ws, <MarkdownView uri="file:///doc.md" />);
    expect(getByText(/Loading/i)).toBeTruthy();

    dispose();
  });

  it("strips the file:// scheme from the uri before calling LoadFileCommand", () => {
    const ws = new Workspace();
    const commands = ws.requireAdapter(Commands);
    const seen = vi.fn();
    const dispose = commands.listen(LoadFileCommand, (cmd) => {
      seen(cmd.payload.path);
      return true;
    });

    mount(ws, <MarkdownView uri="file:///docs/readme.md" />);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith("/docs/readme.md");

    dispose();
  });

  it("decodes the loaded bytes and renders the markdown on success", async () => {
    const ws = new Workspace();
    const commands = ws.requireAdapter(Commands);
    const dispose = commands.listen(LoadFileCommand, (cmd) => {
      cmd.resolve({
        path: cmd.payload.path,
        bytes: new TextEncoder().encode("# Loaded Heading"),
      });
      return true;
    });

    const { findByText } = mount(ws, <MarkdownView uri="file:///doc.md" />);
    const heading = await findByText("Loaded Heading");
    expect(heading.tagName).toBe("H1");

    dispose();
  });

  it("renders the error state with the failure message when loading rejects", async () => {
    const ws = new Workspace();
    const commands = ws.requireAdapter(Commands);
    const dispose = commands.listen(LoadFileCommand, (cmd) => {
      cmd.reject(new Error("disk on fire"));
      return true;
    });

    const { findByText } = mount(ws, <MarkdownView uri="file:///missing.md" />);
    expect(await findByText("Failed to load file")).toBeTruthy();
    expect(await findByText("disk on fire")).toBeTruthy();

    dispose();
  });
});
