import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/app/app.js";
import { OpenFile, RevealFile } from "../src/app/contracts.js";
import { createRuntime } from "../src/app/runtime.js";

afterEach(cleanup);

function renderApp(props: Parameters<typeof App>[0] = {}) {
  const runtime = createRuntime();
  render(<App runtime={runtime} {...props} />);
  return runtime;
}
const tab = (title: string) =>
  screen.queryAllByText(title).filter((el) => el.closest(".dv-tab")) as HTMLElement[];
const groupOf = (el: HTMLElement | undefined) => el?.closest(".dv-groupview");

describe("files:open and files:reveal", () => {
  it("opens a file as a tab beside the active file panel, its cited passage marked", async () => {
    const rt = renderApp();
    await screen.findByRole("row", { name: /2026-Q3\.xlsx/ });
    act(() => {
      rt.commands.call(OpenFile, {
        path: "Clients/Dupont — offer.docx",
        citation: { question: "What did we offer Dupont?", blockId: "o3" },
      });
    });
    expect(await screen.findByText(/Cited in/)).toBeTruthy();
    const [offer] = tab("Dupont — offer.docx");
    expect([groupOf(tab("Clients")[0]), groupOf(tab("Finance")[0])]).toContain(groupOf(offer));
  });

  it("re-opening an open document with another citation marks the new passage", async () => {
    const rt = renderApp();
    const open = (question: string, blockId: string) =>
      act(() => {
        rt.commands.call(OpenFile, {
          path: "Clients/Dupont — offer.docx",
          citation: { question, blockId },
        });
      });
    open("When does phase 1 end?", "o3");
    expect(await screen.findByText(/When does phase 1 end\?/)).toBeTruthy();
    open("What does it cost?", "o5");
    expect(await screen.findByText(/What does it cost\?/)).toBeTruthy();
    expect(screen.queryByText(/When does phase 1 end\?/)).toBeNull();
    const marked = document.querySelectorAll("[data-cited]");
    expect(marked).toHaveLength(1);
    expect(marked[0]?.textContent).toMatch(/€18,400/);
    expect(tab("Dupont — offer.docx")).toHaveLength(1);
  });

  it("opening an open file brings its tab forward", async () => {
    const rt = renderApp();
    for (let i = 0; i < 2; i++) {
      act(() => {
        rt.commands.call(OpenFile, { path: "Notes/todo.md" });
      });
      await screen.findAllByText("todo.md");
    }
    expect(tab("todo.md")).toHaveLength(1);
  });

  it("a file that is not in the folder says so", async () => {
    const rt = renderApp();
    act(() => {
      rt.commands.call(OpenFile, { path: "Clients/Nobody — nothing.pdf" });
    });
    expect(await screen.findByText("“Nobody — nothing.pdf” is not in the folder.")).toBeTruthy();
    expect(tab("Nobody — nothing.pdf")).toHaveLength(0);
  });

  it("reveal shows the folder in a docked panel with the file selected", async () => {
    const rt = renderApp();
    // The Files tree (not docked) is the active panel after a click in it.
    const tree = screen.getByRole("treegrid", { name: "Contents of /documents" });
    fireEvent.mouseDown(tree);
    act(() => {
      rt.commands.call(RevealFile, { path: "Notes/meeting 2026-10-02.md" });
    });
    const row = await screen.findByRole("row", { name: /meeting 2026-10-02\.md/ });
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(within(tree).queryByRole("row", { name: /meeting 2026-10-02\.md/ })).toBeNull();
  });

  it("on a phone, revealing a file switches to Files and shows it selected", async () => {
    const rt = renderApp({ initialMode: "mobile" });
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Views" })).getByRole("button", {
        name: "Todos",
      }),
    );
    act(() => {
      rt.commands.call(RevealFile, { path: "Notes/meeting 2026-10-02.md" });
    });
    const row = await screen.findByRole("row", { name: /meeting 2026-10-02\.md/ });
    expect(row.getAttribute("aria-selected")).toBe("true");
  });

  it("on a phone, opening a file switches to Files and shows it full screen", async () => {
    const rt = renderApp({ initialMode: "mobile" });
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Views" })).getByRole("button", {
        name: "Todos",
      }),
    );
    act(() => {
      rt.commands.call(OpenFile, { path: "Notes/todo.md" });
    });
    expect(await screen.findByRole("region", { name: "Viewer: todo.md" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("region", { name: "Viewer: todo.md" })).toBeNull();
  });
});
