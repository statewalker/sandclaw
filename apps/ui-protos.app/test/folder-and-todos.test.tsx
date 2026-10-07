import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FolderZone } from "../src/folder-zone/folder-zone.js";
import { filterTree, listFiles } from "../src/folder-zone/tree.js";
import type { FolderEntry } from "../src/mock.js";
import { addTodo, collectTodos, setDone } from "../src/notes-todos/todos.js";
import { TodosView } from "../src/notes-todos/todos-view.js";

afterEach(cleanup);

const tree: FolderEntry[] = [
  { name: "Clients", children: [{ name: "Dupont.docx" }, { name: "Leroy.pdf" }] },
  { name: "Notes", children: [{ name: "todo.md" }] },
];

describe("tree", () => {
  it("lists files with their paths, not folders", () => {
    expect(listFiles(tree).map((f) => f.path)).toEqual([
      "Clients/Dupont.docx",
      "Clients/Leroy.pdf",
      "Notes/todo.md",
    ]);
  });

  it("keeps matches and the folders leading to them", () => {
    expect(filterTree(tree, "dupont")).toEqual([
      { name: "Clients", children: [{ name: "Dupont.docx" }] },
    ]);
    expect(filterTree(tree, "nothing")).toEqual([]);
  });
});

describe("todos", () => {
  const files = { "a.md": "# A\n- [ ] one\n- [x] two\n", "b.md": "* [ ] three" };

  it("collects checklist items from every file", () => {
    expect(collectTodos(files)).toEqual([
      { path: "a.md", line: 1, text: "one", done: false },
      { path: "a.md", line: 2, text: "two", done: true },
      { path: "b.md", line: 0, text: "three", done: false },
    ]);
  });

  it("ticks and unticks one line, leaving the rest of the file alone", () => {
    expect(setDone(files["a.md"], 1, true)).toBe("# A\n- [x] one\n- [x] two\n");
    expect(setDone(files["a.md"], 2, false)).toBe("# A\n- [ ] one\n- [ ] two\n");
  });

  it("appends a new item on its own line", () => {
    expect(addTodo("- [ ] one", "two")).toBe("- [ ] one\n- [ ] two\n");
    expect(addTodo("", "first")).toBe("- [ ] first\n");
  });
});

it("ticking a todo moves it to the done items", () => {
  render(<TodosView />);
  expect(screen.getByText("Show 2 done")).toBeTruthy();
  fireEvent.click(screen.getByText("Call Hugo about the Dupont offer"));
  expect(screen.getByText("Show 3 done")).toBeTruthy();
});

it("a typed todo goes to the inbox file", () => {
  render(<TodosView />);
  const input = screen.getByLabelText("Add a todo");
  fireEvent.change(input, { target: { value: "Book the van" } });
  fireEvent.submit(input);
  expect(screen.getByText("Book the van")).toBeTruthy();
});

it("searching the folder narrows the tree", () => {
  render(<FolderZone />);
  fireEvent.change(screen.getByLabelText("Find a file"), { target: { value: "invoice" } });
  expect(screen.getByText("INV-0412.pdf")).toBeTruthy();
  expect(screen.queryByText("Dupont — offer.docx")).toBeNull();
});

it("after a restart one click reconnects the folder", () => {
  render(<FolderZone state="needs-access" />);
  fireEvent.click(screen.getByRole("button", { name: /Reconnect the folder/ }));
  expect(screen.getByLabelText("Find a file")).toBeTruthy();
});
