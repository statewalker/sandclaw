import { Commands } from "@statewalker/shared-commands";
import { AppWorkspaceProvider } from "@statewalker/ui.view.react";
import { LoadFileCommand, Workspace } from "@statewalker/workspace.core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WikiSiteView } from "./wiki-site-view.js";

afterEach(cleanup);

const MANIFEST = {
  slug: "themes",
  title: "Acme themes",
  generated: "",
  pages: [
    { id: "founders", title: "Founders", path: "founders.md", order: 0, promptHash: "a" },
    { id: "products", title: "Products", path: "products.md", order: 1, promptHash: "b" },
  ],
};

const FILES: Record<string, string> = {
  "/proj/sites/themes/site.json": JSON.stringify(MANIFEST),
  "/proj/sites/themes/founders.md": "# Founders\n\nJane founded Acme.",
  "/proj/sites/themes/products.md": "# Products\n\nWe make widgets.",
};

function makeWorkspace(files: Record<string, string>): Workspace {
  const ws = new Workspace();
  const commands = ws.requireAdapter(Commands);
  commands.listen(LoadFileCommand, (command) => {
    const content = files[command.payload.path];
    if (content === undefined) {
      command.reject(new Error(`not found: ${command.payload.path}`));
      return true;
    }
    command.resolve({
      path: command.payload.path,
      bytes: new TextEncoder().encode(content),
      mimeType: "text/markdown",
    });
    return true;
  });
  return ws;
}

function renderSite(ws: Workspace) {
  return render(
    <AppWorkspaceProvider workspace={ws}>
      <WikiSiteView project="proj" slug="themes" />
    </AppWorkspaceProvider>,
  );
}

describe("WikiSiteView", () => {
  it("renders the TOC in order and shows the first page", async () => {
    renderSite(makeWorkspace(FILES));
    // TOC sidebar buttons, in manifest order.
    expect(await screen.findByRole("button", { name: "Founders" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Products" })).toBeTruthy();
    // First page body is shown.
    expect(await screen.findByText("Jane founded Acme.")).toBeTruthy();
  });

  it("selecting a sidebar entry swaps the page body", async () => {
    renderSite(makeWorkspace(FILES));
    fireEvent.click(await screen.findByRole("button", { name: "Products" }));
    expect(await screen.findByText("We make widgets.")).toBeTruthy();
  });

  it("prev/next navigates between pages", async () => {
    renderSite(makeWorkspace(FILES));
    await screen.findByText("Jane founded Acme.");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("We make widgets.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Prev" }));
    expect(await screen.findByText("Jane founded Acme.")).toBeTruthy();
  });

  it("shows a placeholder when no site exists", async () => {
    renderSite(makeWorkspace({}));
    expect(await screen.findByText("No site generated yet.")).toBeTruthy();
  });
});
