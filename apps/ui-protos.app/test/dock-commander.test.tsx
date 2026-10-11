import { readText } from "@statewalker/webrun-files";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { newDemoStorages } from "../src/file-panels/demo-storages.js";
import { DockCommander } from "../src/file-panels/dock-commander.js";

afterEach(cleanup);

// Dockview labels each group with its active tab's title, so the panel is found by its own element.
const panel = (title: string) =>
  screen
    .getAllByRole("region", { name: title })
    .find((el) => el.tagName === "SECTION") as HTMLElement;
const tab = (title: string) =>
  screen.queryAllByText(title).find((el) => el.closest(".dv-tab")) as HTMLElement;
const groupOf = (el: HTMLElement) => el.closest(".dv-groupview");

describe("DockCommander", () => {
  it("opens the panels as tabs of one dock group", async () => {
    render(<DockCommander panels={["/documents/notes", "/archive/2026"]} />);
    expect(groupOf(tab("notes"))).toBe(groupOf(tab("2026")));
    expect(await within(panel("notes")).findByRole("row", { name: "todo.md" })).toBeTruthy();
  });

  it("split opens them side by side", () => {
    render(<DockCommander split panels={["/documents/notes", "/archive/2026"]} />);
    expect(groupOf(tab("notes"))).not.toBe(groupOf(tab("2026")));
  });

  it("New panel adds a tab next to the active one", () => {
    render(<DockCommander panels={["/documents/notes"]} />);
    fireEvent.click(screen.getByRole("button", { name: "New panel" }));
    const tabs = screen.getAllByText("notes").filter((el) => el.closest(".dv-tab"));
    expect(tabs).toHaveLength(2);
    expect(groupOf(tabs[0] as HTMLElement)).toBe(groupOf(tabs[1] as HTMLElement));
  });

  it("F5 targets the other tab and copies there", async () => {
    const storages = newDemoStorages();
    render(<DockCommander storages={storages} panels={["/documents/notes", "/archive/2026"]} />);
    const notes = panel("notes");
    fireEvent.click(await within(notes).findByRole("row", { name: "todo.md" }));
    fireEvent.keyDown(within(notes).getByRole("grid"), { key: "F5" });
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Done")).toBeTruthy();
    expect(await readText(storages.files, "/archive/2026/todo.md")).toContain("# Todo");
  });

  it("an opened file gets its own tab", async () => {
    render(<DockCommander panels={["/documents/notes"]} />);
    const row = await within(panel("notes")).findByRole("row", { name: "todo.md" });
    fireEvent.doubleClick(row);
    const viewer = await screen.findByRole("region", { name: "Viewer: todo.md" });
    expect(await within(viewer).findByText(/# Todo/)).toBeTruthy();
    expect(groupOf(tab("todo.md"))).toBe(groupOf(tab("notes")));
  });

  it("closing a tab closes its panel for good", () => {
    render(<DockCommander panels={["/documents/notes", "/archive/2026"]} />);
    const close = tab("2026").closest(".dv-tab")?.querySelector(".dv-default-tab-action");
    fireEvent.pointerDown(close as Element);
    fireEvent.click(close as Element);
    // A panel the commander still had would get its tab back on the next change.
    fireEvent.click(screen.getByRole("button", { name: "New panel" }));
    expect(tab("2026")).toBeUndefined();
    expect(screen.getAllByText("notes").filter((el) => el.closest(".dv-tab"))).toHaveLength(2);
  });
});
