import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { JoinFlow } from "../src/join-invite/join-invite.js";

afterEach(cleanup);

const join = () => fireEvent.click(screen.getByRole("button", { name: "Join Atelier Morel" }));

it("joining leads straight to choosing a folder — no password, no key", async () => {
  render(<JoinFlow joinMs={0} />);
  join();
  expect(await screen.findByText("You're in Atelier Morel")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Open a folder on this computer/ })).toBeTruthy();
  expect(screen.queryByLabelText(/password|key/i)).toBeNull();
});

it("an offline machine names the person who can fix it", async () => {
  render(<JoinFlow joinMs={0} outcome="machine-offline" />);
  join();
  expect(await screen.findByText(/Ask Claire to check it's switched on/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
});

it("a used invite says to ask for a new one", async () => {
  render(<JoinFlow joinMs={0} outcome="invite-used" variant="promises" />);
  join();
  expect(await screen.findByText(/Ask Claire for a new link/)).toBeTruthy();
});
