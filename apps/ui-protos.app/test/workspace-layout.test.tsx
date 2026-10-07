import { composeStories } from "@storybook/react-vite";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import * as stories from "../src/workspace-layout/workspace-layout.stories.js";

const { LockToggle, Reading } = composeStories(stories);

afterEach(cleanup);

const assistant = () => screen.queryByPlaceholderText("Ask about your folder…");
const todo = () => screen.queryByText("Call Hugo about the Dupont offer");
const plugin = (name: string) => screen.getByRole("button", { name });

it("the Assistant preset places every panel in its target zone", () => {
  render(<LockToggle />);
  expect(screen.getByText("Clients")).toBeTruthy();
  expect(todo()).toBeTruthy();
  expect(screen.getByText("Offer — Dupont & Fils")).toBeTruthy();
  expect(assistant()).toBeTruthy();
  expect(screen.getByText(/Q3 spending summary · 2 of 4/)).toBeTruthy();
});

it("a preset without a right zone leaves the assistant out", () => {
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
