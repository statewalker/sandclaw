import { composeStories } from "@storybook/react-vite";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import * as stories from "../src/workspace-layout/workspace-layout.stories.js";

const { LockToggle, PerZone, Reading, WithFiles } = composeStories(stories);

afterEach(cleanup);

const assistant = () => screen.queryByPlaceholderText("Ask about your folder…");
const todo = () => screen.queryByText("Call Hugo about the Dupont offer");
const plugin = (name: string) => screen.getByRole("button", { name });

it("the Assistant layout places every panel in its target zone", () => {
  render(<LockToggle />);
  expect(screen.getByText("Clients")).toBeTruthy();
  expect(todo()).toBeTruthy();
  expect(screen.getByText("Offer — Dupont & Fils")).toBeTruthy();
  expect(assistant()).toBeTruthy();
  expect(screen.getByText(/Q3 spending summary · 2 of 4/)).toBeTruthy();
});

it("a layout without a right zone leaves the assistant out", () => {
  render(<Reading />);
  expect(screen.getByText("Offer — Dupont & Fils")).toBeTruthy();
  expect(assistant()).toBeNull();
});

it("uninstalling a plugin repairs the layout and keeps the rest", () => {
  render(<LockToggle />);
  fireEvent.click(plugin("Todos"));
  expect(screen.getByText(/Removed from your layout: todos/)).toBeTruthy();
  expect(todo()).toBeNull();
  expect(screen.getByText("Clients")).toBeTruthy();
  expect(assistant()).toBeTruthy();
});

it("a reinstalled plugin returns to its preferred zone", () => {
  render(<LockToggle />);
  fireEvent.click(plugin("Todos"));
  fireEvent.click(plugin("Todos"));
  expect(todo()).toBeTruthy();
});

it("a plugin with no target zone waits to be opened", () => {
  render(<LockToggle />);
  fireEvent.click(plugin("Outline"));
  expect(screen.getByText(/Outline installed — it has no default place/)).toBeTruthy();
  expect(screen.queryByText("Phase 1 — structure", { selector: "li" })).toBeNull();
});

describe("per-zone locks", () => {
  // The dock group that holds a given text, and whether dockview treats it as fixed.
  const dockOf = (text: string) => screen.getByText(text).closest(".dv-groupview") as HTMLElement;
  const isFixed = (el: HTMLElement) => el.classList.contains("dv-locked-groupview");

  it("starts with every side bar fixed and the center free", () => {
    render(<PerZone />);
    expect(isFixed(dockOf("Clients"))).toBe(true);
    expect(isFixed(dockOf("Offer — Dupont & Fils"))).toBe(false);
    for (const bar of ["Left bar", "Right bar", "Bottom bar"]) {
      expect(screen.getByRole("button", { name: bar }).getAttribute("aria-pressed")).toBe("true");
    }
  });

  it("unlocks one bar without touching the others", () => {
    render(<PerZone />);
    fireEvent.click(screen.getByRole("button", { name: "Left bar" }));
    expect(isFixed(dockOf("Clients"))).toBe(false);
    expect(isFixed(dockOf("Offer — Dupont & Fils"))).toBe(false);
    expect(
      isFixed(
        screen
          .getByPlaceholderText("Ask about your folder…")
          .closest(".dv-groupview") as HTMLElement,
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Left bar" }));
    expect(isFixed(dockOf("Clients"))).toBe(true);
  });
});

describe("file panels in the workspace", () => {
  const tab = (title: string) =>
    screen.queryAllByText(title).find((el) => el.closest(".dv-tab")) as HTMLElement | undefined;
  const groupOf = (el?: HTMLElement) => el?.closest(".dv-groupview");

  it("are tabs of the center, next to the documents", () => {
    render(<WithFiles />);
    expect(tab("clients")).toBeTruthy();
    expect(groupOf(tab("clients"))).toBe(groupOf(tab("Dupont — offer.docx")));
    expect(groupOf(tab("2025"))).toBe(groupOf(tab("Dupont — offer.docx")));
  });

  it("stay open when the layout is repaired", () => {
    render(<WithFiles />);
    fireEvent.click(plugin("Todos"));
    expect(screen.getByText(/Removed from your layout: todos/)).toBeTruthy();
    expect(tab("2025")).toBeTruthy();
    // The panel itself, not only its tab: a re-layout must not close what it puts back.
    const panel = screen
      .getAllByRole("region", { name: "clients" })
      .find((el) => el.tagName === "SECTION");
    expect(panel).toBeTruthy();
  });
});
