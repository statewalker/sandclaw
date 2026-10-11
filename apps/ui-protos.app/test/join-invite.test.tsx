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

const decline = () => {
  fireEvent.click(screen.getByRole("button", { name: "Decline" }));
  fireEvent.click(screen.getByRole("button", { name: "Decline invite" }));
};

it("declining asks first, then ends calmly", async () => {
  render(<JoinFlow joinMs={0} />);
  fireEvent.click(screen.getByRole("button", { name: "Decline" }));
  expect(screen.getByText("Claire will see you declined. This link stops working.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/Note to Claire/), { target: { value: "Wrong person" } });
  fireEvent.click(screen.getByRole("button", { name: "Decline invite" }));
  expect(await screen.findByText("You declined the invite to Atelier Morel")).toBeTruthy();
  expect(screen.getByText(/Claire will see you declined, with your note/)).toBeTruthy();
});

it("a decline with the machine offline says it isn't recorded and the invite simply expires", async () => {
  render(<JoinFlow joinMs={0} outcome="machine-offline" variant="promises" />);
  decline();
  expect(await screen.findByText(/can't be recorded now/)).toBeTruthy();
  expect(screen.getByText(/expires by itself/)).toBeTruthy();
});

it("an expired invite says who to ask for a new one", async () => {
  render(<JoinFlow joinMs={0} outcome="invite-expired" />);
  join();
  expect(await screen.findByText("This invite has expired")).toBeTruthy();
  expect(screen.getByText(/Ask Claire for a new link/)).toBeTruthy();
});
