import { readText } from "@statewalker/webrun-files";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { newDemoStorages } from "../src/file-panels/demo-storages.js";
import { FileCommander } from "../src/file-panels/file-commander.js";

afterEach(cleanup);

const panel = (title: string) => screen.getByRole("region", { name: title });
const menuLabels = () => screen.getAllByRole("menuitem").map((item) => item.textContent);
const closeMenu = () => fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

describe("a file panel's list and tree views", () => {
  it("the tree opens folders in place: → opens and goes in, ← closes", async () => {
    render(<FileCommander panels={["/documents", "/archive"]} />);
    const docs = panel("Documents");
    fireEvent.click(within(docs).getByRole("button", { name: "Tree view" }));
    const tree = within(docs).getByRole("treegrid");
    const notes = await within(tree).findByRole("row", { name: "notes" });
    expect(notes.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(notes);
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    const first = await within(tree).findByRole("row", { name: "meeting-2026-10-02.md" });
    expect(first.getAttribute("aria-level")).toBe("2");
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    expect(first.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(notes.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(within(tree).queryByRole("row", { name: "todo.md" })).toBeNull();
  });

  it("offers the same commands in both views, for a folder and for a file", async () => {
    render(<FileCommander panels={["/documents", "/archive"]} />);
    const docs = panel("Documents");
    const menusOf = async (folder: string, file: string) => {
      fireEvent.contextMenu(await within(docs).findByRole("row", { name: folder }));
      const forFolder = menuLabels();
      closeMenu();
      fireEvent.contextMenu(await within(docs).findByRole("row", { name: file }));
      const forFile = menuLabels();
      closeMenu();
      return { forFolder, forFile };
    };

    // The list shows /documents/notes's files once it navigates there; the tree opens it in place.
    const list = await menusOf("notes", "notes");
    fireEvent.click(within(docs).getByRole("button", { name: "Tree view" }));
    fireEvent.click(within(docs).getByRole("button", { name: "Open notes" }));
    const tree = await menusOf("notes", "todo.md");
    fireEvent.click(within(docs).getByRole("button", { name: "List view" }));
    fireEvent.doubleClick(await within(docs).findByRole("row", { name: "notes" }));
    const listFile = await menusOf("todo.md", "todo.md");

    expect(tree.forFolder).toEqual(list.forFolder);
    expect(tree.forFile).toEqual(listFile.forFile);
    expect(list.forFolder).toEqual(
      expect.arrayContaining(["New note", "New folderF7", "Add files…", "Open in new panel"]),
    );
    expect(listFile.forFile).toEqual(expect.arrayContaining(["Download", "Copy to…F5"]));
  });

  it("F5 on a file inside an open folder of the tree copies it to the other panel", async () => {
    const storages = newDemoStorages();
    render(<FileCommander storages={storages} panels={["/documents", "/archive/2026"]} />);
    const docs = panel("Documents");
    fireEvent.click(within(docs).getByRole("button", { name: "Tree view" }));
    fireEvent.click(await within(docs).findByRole("button", { name: "Open notes" }));
    fireEvent.click(await within(docs).findByRole("row", { name: "todo.md" }));
    fireEvent.keyDown(within(docs).getByRole("treegrid"), { key: "F5" });
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Done")).toBeTruthy();
    expect(await readText(storages.files, "/archive/2026/todo.md")).toContain("# Todo");
  });
});

describe("the row's ⋯ button", () => {
  it("opens the same menu as a right-click, in the list and in the tree", async () => {
    render(<FileCommander panels={["/documents/notes", "/archive"]} />);
    const notes = panel("notes");
    const row = await within(notes).findByRole("row", { name: "todo.md" });
    fireEvent.contextMenu(row);
    const byRightClick = menuLabels();
    closeMenu();

    fireEvent.click(within(row).getByRole("button", { name: "Actions for todo.md" }));
    expect(menuLabels()).toEqual(byRightClick);
    closeMenu();

    fireEvent.click(within(notes).getByRole("button", { name: "Tree view" }));
    const treeRow = await within(notes).findByRole("row", { name: "todo.md" });
    fireEvent.click(within(treeRow).getByRole("button", { name: "Actions for todo.md" }));
    expect(menuLabels()).toEqual(byRightClick);
  });

  it("Shift+F10 opens the menu of the row under the cursor", async () => {
    render(<FileCommander panels={["/documents/notes", "/archive"]} />);
    const grid = within(panel("notes")).getByRole("grid");
    fireEvent.click(await within(grid).findByRole("row", { name: "todo.md" }));
    fireEvent.keyDown(grid, { key: "F10", shiftKey: true });
    expect(menuLabels()).toContain("Download");
  });
});

describe("commands the list gained from the tree", () => {
  it("New note makes Untitled.md, then Untitled (2).md, and asks for a name", async () => {
    const storages = newDemoStorages();
    render(<FileCommander storages={storages} panels={["/documents/notes", "/archive"]} />);
    const grid = within(panel("notes")).getByRole("grid");
    await within(grid).findByRole("row", { name: "todo.md" });
    for (const name of ["Untitled.md", "Untitled (2).md"]) {
      fireEvent.contextMenu(grid);
      fireEvent.click(screen.getByRole("menuitem", { name: "New note" }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByRole("textbox")).toHaveProperty("value", name);
      expect(await storages.files.exists(`/documents/notes/${name}`)).toBe(true);
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    }
  });

  it("Add files… on a folder copies the chosen files into it", async () => {
    const storages = newDemoStorages();
    render(<FileCommander storages={storages} panels={["/documents", "/archive"]} />);
    fireEvent.contextMenu(await within(panel("Documents")).findByRole("row", { name: "notes" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add files…" }));
    const file = new File(["# Plan"], "plan.md");
    fireEvent.change(screen.getByLabelText("Files to add"), { target: { files: [file] } });
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Done")).toBeTruthy();
    expect(await readText(storages.files, "/documents/notes/plan.md")).toBe("# Plan");
  });
});
