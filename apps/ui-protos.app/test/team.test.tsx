import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TeamOneList, TeamTwoPanes } from "../src/team/team.js";

afterEach(cleanup);

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

it("creating an invite shows a link and adds a pending invite", async () => {
  render(<TeamOneList />);
  click("Invite someone");
  fireEvent.change(screen.getByLabelText("Who is it for?"), { target: { value: "Lucie" } });
  click("30 days");
  click("Create link");
  const link = (await screen.findByLabelText("Invite link")) as HTMLInputElement;
  expect(link.value).toMatch(/^https:\/\/app\.sandclaw\.ai\/join#/);
  expect(screen.getByText("Works once. Expires on 9 November.")).toBeTruthy();
  click("Done");
  expect(screen.getByRole("listitem", { name: "Lucie" })).toBeTruthy();
});

it("removing a person asks first, then removes them", async () => {
  render(<TeamOneList />);
  const hugo = screen.getByRole("listitem", { name: "Hugo Benali" });
  fireEvent.click(within(hugo).getByRole("button", { name: "Remove" }));
  expect(await screen.findByText(/lose access at once/)).toBeTruthy();
  click("Remove Hugo");
  expect(screen.queryByRole("listitem", { name: "Hugo Benali" })).toBeNull();
});

it("a member sees no devices and no invite button", () => {
  render(<TeamTwoPanes viewer="member" />);
  expect(screen.getByText("Inès Garnier")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Invite someone" })).toBeNull();
  expect(screen.queryByText(/Firefox on Linux|devices/)).toBeNull();
});

it("the last admin cannot be demoted", () => {
  render(<TeamOneList />);
  const claire = screen.getByRole("listitem", { name: "Claire Morel" });
  const demote = within(claire).getByRole("button", { name: "Make member" }) as HTMLButtonElement;
  expect(demote.disabled).toBe(true);
  expect(within(claire).getByText(/The only admin/)).toBeTruthy();
});
