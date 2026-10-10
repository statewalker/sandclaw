import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TocEditor } from "../src/site-toc/toc-editor.js";
import { dupontToc, editedDupontToc, topics } from "../src/site-toc/toc-mock.js";
import {
  accept,
  indent,
  moveSection,
  outdent,
  pageChanges,
  proposals,
  type Result,
  renameSection,
  rows,
  suggestToc,
  type Toc,
} from "../src/site-toc/toc-model.js";

afterEach(cleanup);

/** "Overview, The works > Kitchen, …": titles in reading order, a sub-page after ">". */
const outline = (toc: Toc) =>
  rows(toc)
    .map((r) => (r.depth ? `> ${r.section.title}` : r.section.title))
    .join(", ");
const ok = (r: Result) => {
  if ("error" in r) throw new Error(r.error);
  return r.toc;
};

describe("the table of contents", () => {
  it("moves a section before, after or under another", () => {
    expect(outline(ok(moveSection(dupontToc, "s_photos", "s_overview", "before")))).toBe(
      "Photos, Overview, The works, > Kitchen, > Oak beams, Schedule, Budget",
    );
    expect(outline(ok(moveSection(dupontToc, "s_kitchen", "s_budget", "after")))).toBe(
      "Overview, The works, > Oak beams, Schedule, Budget, Kitchen, Photos",
    );
    expect(outline(ok(moveSection(dupontToc, "s_photos", "s_works", "inside")))).toBe(
      "Overview, The works, > Kitchen, > Oak beams, > Photos, Schedule, Budget",
    );
  });

  it("refuses a section inside itself, and a third level", () => {
    expect(moveSection(dupontToc, "s_works", "s_kitchen", "after")).toEqual({
      error: "A section can’t go inside itself.",
    });
    expect(moveSection(dupontToc, "s_works", "s_overview", "inside")).toHaveProperty("error");
    expect(moveSection(dupontToc, "s_photos", "s_kitchen", "inside")).toHaveProperty("error");
  });

  it("indents under the section above, and outdents to right after the parent", () => {
    expect(outline(ok(indent(dupontToc, "s_schedule")))).toBe(
      "Overview, The works, > Kitchen, > Oak beams, > Schedule, Budget, Photos",
    );
    expect(outline(ok(outdent(dupontToc, "s_kitchen")))).toBe(
      "Overview, The works, > Oak beams, Kitchen, Schedule, Budget, Photos",
    );
    expect(indent(dupontToc, "s_overview")).toHaveProperty("error");
    expect(outdent(dupontToc, "s_overview")).toHaveProperty("error");
  });

  it("a suggestion only adds: the user's titles and placed topics stay", () => {
    // The user renamed "Schedule" and moved the "Suppliers" topic into "Budget".
    const mine = renameSection(
      accept(dupontToc, {
        kind: "topics",
        sectionId: "s_budget",
        title: "Budget",
        topics: ["t_suppliers"],
      }),
      "s_schedule",
      "Planning",
    );
    const offered = proposals(mine, suggestToc(topics));
    expect(offered.map((p) => (p.kind === "add" ? `new ${p.section.title}` : p.title))).toEqual([
      "The works", // + Bathroom
      "new Schedule", // the user's is now "Planning"
      "Budget", // + Invoices
    ]);
    const merged = offered.reduce(accept, mine);
    expect(outline(merged)).toBe(
      "Overview, The works, > Kitchen, > Oak beams, Planning, Budget, Photos, Schedule",
    );
    // Accepting everything leaves nothing more to offer.
    expect(proposals(merged, suggestToc(topics))).toEqual([]);
  });

  it("marks new, renamed and re-sourced pages for rewriting, not moved ones", () => {
    const { rewrite, removed } = pageChanges(dupontToc, editedDupontToc);
    expect([...rewrite].sort()).toEqual(["s_budget", "s_kitchen", "s_suppliers"]);
    expect(removed).toEqual(["Photos"]);
  });
});

describe("the editor", () => {
  it("Alt+↓ moves the section below the next one, Alt+→ puts it under", () => {
    render(<TocEditor variant="outline" />);
    const topLevel = () =>
      screen
        .getAllByRole("treeitem")
        .filter((r) => r.getAttribute("aria-level") === "1")
        .map((r) => r.getAttribute("aria-label"));
    fireEvent.keyDown(screen.getByRole("treeitem", { name: "Overview" }), {
      key: "ArrowDown",
      altKey: true,
    });
    expect(topLevel().slice(0, 2)).toEqual(["The works", "Overview"]);
    fireEvent.keyDown(screen.getByRole("treeitem", { name: "Overview" }), {
      key: "ArrowRight",
      altKey: true,
    });
    expect(screen.getByRole("treeitem", { name: "Overview" }).getAttribute("aria-level")).toBe("2");
    // A move changes the menu, not the pages.
    expect(screen.getByText(/Only the menu changes; no page is rewritten/)).toBeTruthy();
  });

  it("attaching a topic clears the nothing-to-write-from warning", () => {
    render(<TocEditor selected="s_photos" />);
    expect(screen.getByText(/nothing to write this page from/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add topic" }));
    fireEvent.change(screen.getByLabelText("Search topics"), { target: { value: "supp" } });
    fireEvent.click(screen.getByRole("button", { name: /Suppliers/ }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText(/nothing to write this page from/)).toBeNull();
    expect(screen.getByText("Suppliers (5)")).toBeTruthy();
  });

  it("asks before removing a section with pages under it", () => {
    render(<TocEditor />);
    fireEvent.keyDown(screen.getByRole("treeitem", { name: "The works" }), { key: "Delete" });
    expect(screen.getByRole("alertdialog").textContent).toMatch(
      /Remove “The works” and 2 pages under it\?/,
    );
    expect(screen.getByRole("treeitem", { name: "Kitchen", hidden: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("treeitem", { name: "Kitchen" })).toBeNull();
    // A section with nothing in it goes without asking.
    fireEvent.keyDown(screen.getByRole("treeitem", { name: "Photos" }), { key: "Delete" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("treeitem", { name: "Photos" })).toBeNull();
  });
});
