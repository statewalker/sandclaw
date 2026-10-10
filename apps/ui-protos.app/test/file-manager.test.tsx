import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FileManager, FOLDER_PATH_TYPE } from "../src/files/file-manager.js";
import { importFiles, move, nameError, rename, viewerFor } from "../src/files/file-ops.js";
import { folder } from "../src/mock.js";

afterEach(cleanup);

describe("file operations", () => {
  it("refuses empty names, forbidden characters and names taken in any case", () => {
    expect(nameError(folder, "Clients", "  ")).toBe("Type a name.");
    expect(nameError(folder, "Clients", "Q3: final.pdf")).toMatch(/can’t contain/);
    expect(nameError(folder, "Clients", "LEROY — BRIEF.PDF")).toBe(
      "There is already “Leroy — brief.pdf” in “Clients”.",
    );
    expect(nameError(folder, "Notes", "Leroy — brief.pdf")).toBeUndefined();
  });

  it("renames, and lets a name change only its case", () => {
    const r = rename(folder, "Notes/todo.md", "Todo.md");
    expect(r).toMatchObject({ path: "Notes/Todo.md" });
  });

  it("does not move a folder into itself or a folder inside it", () => {
    expect(move(folder, "Clients", "Clients/contracts")).toEqual({
      error: "A folder can’t go inside itself.",
    });
    expect(move(folder, "Clients", "Clients")).toHaveProperty("error");
    expect(move(folder, "Clients/contracts", "Finance")).toMatchObject({
      path: "Finance/contracts",
    });
  });

  it("imports a file whose name is taken as “name (2).ext”", () => {
    const r = importFiles(folder, "Clients", ["Dupont — notes.md", "Dupont — notes.md"]);
    expect(r.paths).toEqual(["Clients/Dupont — notes (2).md", "Clients/Dupont — notes (3).md"]);
  });

  it("picks the viewer from the extension, ignoring case", () => {
    expect(viewerFor("meeting.md")).toBe("note");
    expect(viewerFor("INV-0412.PDF")).toBe("pdf");
    expect(viewerFor("2026-Q3.xlsx")).toBe("spreadsheet");
    expect(viewerFor("archive.zip")).toBe("none");
    expect(viewerFor("Makefile")).toBe("none");
  });
});

describe("the file tree", () => {
  it("renames with F2 and Enter", () => {
    render(<FileManager />);
    fireEvent.keyDown(screen.getByRole("treeitem", { name: "todo.md" }), { key: "F2" });
    const field = screen.getByLabelText("New name");
    fireEvent.change(field, { target: { value: "meeting 2026-10-02.md" } });
    expect(screen.getByRole("alert").textContent).toMatch(/already/);
    fireEvent.change(field, { target: { value: "todo — October.md" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByRole("treeitem", { name: "todo — October.md" })).toBeTruthy();
    expect(screen.queryByRole("treeitem", { name: "todo.md" })).toBeNull();
  });

  it("asks before deleting, and says how many files a folder holds", () => {
    render(<FileManager deleteMode="permanent" />);
    fireEvent.keyDown(screen.getByRole("treeitem", { name: "Clients" }), { key: "Delete" });
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toMatch(/the 4 files in it will be deleted from your computer/);
    // Nothing is gone until the user confirms (the open dialog hides the tree from queries).
    expect(screen.getByRole("treeitem", { name: "Clients", hidden: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete 4 files" }));
    expect(screen.queryByRole("treeitem", { name: "Clients" })).toBeNull();
  });

  it("dragging a file carries its path for the chat composer", () => {
    render(<FileManager />);
    const data = new Map<string, string>();
    const dataTransfer = { setData: (t: string, v: string) => data.set(t, v) };
    fireEvent.dragStart(screen.getByRole("treeitem", { name: "todo.md" }), { dataTransfer });
    expect(data.get(FOLDER_PATH_TYPE)).toBe("Notes/todo.md");
  });
});
