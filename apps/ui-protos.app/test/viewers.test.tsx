import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { offerCitation } from "../src/viewers/files.js";
import { parseInline, parseMarkdown } from "../src/viewers/markdown.js";
import { NoteEditor } from "../src/viewers/note-editor.js";
import { FileViewer } from "../src/viewers/viewers.js";

afterEach(cleanup);

const note = `# Plan

Some **bold** and *italic*, see [offer](https://x.test).

\`\`\`
- [ ] not a todo
\`\`\`

- [ ] Call Hugo
- [x] Call Hugo
1. first

| A | B |
| --- | --- |
| 1 | 2 |`;

const source = () => (screen.getByLabelText("Note source") as HTMLTextAreaElement).value;

it("parses the note subset, keeping each todo's source line", () => {
  expect(parseMarkdown(note).map((b) => [b.kind, b.line, b.end])).toEqual([
    ["heading", 0, 1],
    ["paragraph", 2, 3],
    ["code", 4, 7],
    ["list", 8, 10],
    ["list", 10, 11],
    ["table", 12, 15],
  ]);
  const todos = parseMarkdown(note).find((b) => b.kind === "list");
  expect(todos?.kind === "list" && todos.items).toEqual([
    { line: 8, text: "Call Hugo", done: false },
    { line: 9, text: "Call Hugo", done: true },
  ]);
  expect(parseInline("Some **bold** and *it*, [offer](https://x.test) `c`")).toEqual([
    "Some ",
    { kind: "strong", children: ["bold"] },
    " and ",
    { kind: "em", children: ["it"] },
    ", ",
    { kind: "link", href: "https://x.test", children: ["offer"] },
    " ",
    { kind: "code", text: "c" },
  ]);
});

it("ticking a todo in the preview writes back to its own line", () => {
  render(<NoteEditor text={note} mode="split" />);
  const [first] = screen.getAllByRole("checkbox", { name: "Call Hugo" });
  fireEvent.click(first as HTMLElement);
  const lines = source().split("\n");
  expect(lines[5]).toBe("- [ ] not a todo");
  expect(lines[8]).toBe("- [x] Call Hugo");
  expect(screen.getByRole("status").textContent).toContain("Saving");
});

it("opens in Preview; clicking the text switches to Source", () => {
  render(<NoteEditor text={note} />);
  expect(screen.queryByLabelText("Note source")).toBeNull();
  fireEvent.click(screen.getByText("Plan"));
  expect(screen.getByRole("button", { name: "Source" }).getAttribute("aria-pressed")).toBe("true");
  expect(source()).toBe(note);
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(screen.queryByLabelText("Note source")).toBeNull();
});

it("the live editor turns the clicked block into its source", () => {
  render(<NoteEditor variant="live" text={note} />);
  fireEvent.click(screen.getByText("Plan"));
  const block = screen.getByLabelText("Edit this part of the note") as HTMLTextAreaElement;
  expect(block.value).toBe("# Plan");
  fireEvent.change(block, { target: { value: "# Plan B" } });
  fireEvent.blur(block);
  expect(screen.getByText("Plan B")).toBeTruthy();
});

it("a change on disk: take theirs, or keep mine", () => {
  const theirs = note.replace("# Plan", "# Their plan");
  render(<NoteEditor text={note} mode="source" theirs={theirs} />);
  expect(screen.getByRole("status").textContent).toContain("Not saved");
  fireEvent.click(screen.getByRole("button", { name: "Take theirs" }));
  expect(source()).toBe(theirs);
  expect(screen.queryByRole("button", { name: "Keep mine" })).toBeNull();
  cleanup();

  render(<NoteEditor text={note} mode="source" theirs={theirs} />);
  fireEvent.click(screen.getByRole("button", { name: "See both" }));
  expect(screen.getByRole("region", { name: "Changed on disk" }).textContent).toContain(
    "# Their plan",
  );
  fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
  expect(source()).toBe(note);
  expect(screen.getByRole("status").textContent).toContain("Saving");
});

it("a disconnected folder keeps the edit unsaved until Reconnect", () => {
  render(<NoteEditor text={note} mode="source" disconnected />);
  fireEvent.change(screen.getByLabelText("Note source"), { target: { value: "edited" } });
  expect(screen.getByRole("status").textContent).toContain("the folder is disconnected");
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(screen.getByRole("status").textContent).toContain("Saving");
});

it("a file opened from an answer names the question and marks the cited passage", () => {
  render(<FileViewer path="Clients/Dupont — offer.docx" citation={offerCitation} />);
  expect(screen.getByText(/Cited in:/).textContent).toContain(offerCitation.question);
  expect(document.querySelector("[data-cited]")?.textContent).toMatch(/^Phase 1/);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(document.querySelector("[data-cited]")).toBeNull();
});

it("a spreadsheet switches sheets with its tabs", () => {
  render(<FileViewer path="Finance/2026-Q3.xlsx" />);
  expect(screen.queryByText("INV-0412")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Invoices" }));
  expect(screen.getByText("INV-0412")).toBeTruthy();
});
