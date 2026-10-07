import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import * as stories from "../src/workspace-layout/workspace-layout.stories.js";

const { Assistant, Reading, PluginMissing } = composeStories(stories);

afterEach(cleanup);

it("the Assistant preset fills all four zones", () => {
  render(<Assistant />);
  expect(screen.getByText("Clients")).toBeTruthy();
  expect(screen.getByText("Call Hugo about the Dupont offer")).toBeTruthy();
  expect(screen.getByText("Offer — Dupont & Fils")).toBeTruthy();
  expect(screen.getByPlaceholderText("Ask about your folder…")).toBeTruthy();
  expect(screen.getByText(/Clients deck · 2 of 4/)).toBeTruthy();
});

it("the Reading preset leaves the assistant and tasks out", () => {
  render(<Reading />);
  expect(screen.getByText("Offer — Dupont & Fils")).toBeTruthy();
  expect(screen.queryByPlaceholderText("Ask about your folder…")).toBeNull();
  expect(screen.queryByText(/Clients deck · 2 of 4/)).toBeNull();
});

it("a panel whose plugin is not installed is left out and reported", () => {
  render(<PluginMissing />);
  expect(screen.getByText("Not installed, left out of this layout: todos")).toBeTruthy();
  expect(screen.queryByText("Call Hugo about the Dupont offer")).toBeNull();
});
