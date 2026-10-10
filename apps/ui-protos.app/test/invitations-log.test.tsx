import { composeStories } from "@storybook/react-vite";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { InvitationsLog } from "../src/invitations-log/invitations-log.js";
import * as stories from "../src/invitations-log/invitations-log.stories.js";

afterEach(cleanup);

it("shows the last 30 days by default", () => {
  render(<InvitationsLog />);
  expect(screen.getByRole("button", { name: "Last 30 days" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(screen.getByText("Inès (design)")).toBeTruthy();
  // Hugo's invite was created and accepted more than 30 days ago.
  expect(screen.queryByText("Hugo")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  expect(screen.getByText("Hugo")).toBeTruthy();
});

it("searching “ines” finds Inès's invites, accents ignored", () => {
  render(<InvitationsLog />);
  fireEvent.change(screen.getByLabelText("Search invitations"), { target: { value: "ines" } });
  expect(screen.getByText("Inès (design)")).toBeTruthy();
  expect(screen.getByText("Inès — phone")).toBeTruthy();
  expect(screen.queryByText("Marc (intern)")).toBeNull();
});

it("state chips count the invites they show", () => {
  render(<InvitationsLog />);
  const chip = (name: RegExp) => screen.getByRole("button", { name });
  expect(chip(/^All 6$/)).toBeTruthy();
  expect(chip(/^Accepted 2$/)).toBeTruthy();
  for (const s of ["Waiting", "Declined", "Expired", "Cancelled"]) {
    expect(chip(new RegExp(`^${s} 1$`))).toBeTruthy();
  }
  fireEvent.click(chip(/^Accepted 2$/));
  expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(2);
});

it("a declined invite reads as declined, and a waiting one says when it expires", () => {
  render(<InvitationsLog />);
  const marc = screen.getByText("Marc (intern)").closest("button") as HTMLElement;
  expect(within(marc).getByText(/^Declined on/)).toBeTruthy();
  expect(within(marc).getByText("Declined")).toBeTruthy();
  expect(screen.getByText(/expires in 6 days/)).toBeTruthy();
});

it("an empty period and a failed search say so", () => {
  const { EmptyPeriod, NoMatch } = composeStories(stories);
  render(<EmptyPeriod />);
  expect(screen.getByText("No invites in the last 7 days")).toBeTruthy();
  cleanup();
  render(<NoMatch />);
  expect(screen.getByText(/No invites match “Bernard”/)).toBeTruthy();
});
