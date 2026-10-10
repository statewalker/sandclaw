import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MyIdentityPage } from "../src/my-identity/my-identity.js";

afterEach(cleanup);

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

it("renaming shows the new name", () => {
  render(<MyIdentityPage />);
  click(/Change/);
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Claire M." } });
  click("Save");
  expect(screen.getByText("Claire M.")).toBeTruthy();
  expect(screen.getByText("People in Atelier Morel will see this name.")).toBeTruthy();
});

it("removing another device asks first, then removes it", () => {
  render(<MyIdentityPage />);
  expect(screen.getAllByRole("button", { name: /Remove/ })).toHaveLength(1);
  click(/Remove/);
  const dialog = screen.getByRole("alertdialog");
  expect(
    within(dialog).getByText(/Safari on iPhone will no longer reach Atelier Morel/),
  ).toBeTruthy();
  click("Remove device");
  expect(screen.queryByText("Safari on iPhone")).toBeNull();
  expect(screen.getByText("Firefox on Linux")).toBeTruthy();
});

it("removing a device is disabled while the machine is offline", () => {
  render(<MyIdentityPage machineOnline={false} />);
  expect(screen.getByRole("button", { name: /Remove/ }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByText(/Removing a device needs the Sandclaw machine/)).toBeTruthy();
});

it("leaving on the only device warns that a new invite is needed", () => {
  render(<MyIdentityPage onlyDevice />);
  click(/Leave the group on this device/);
  expect(screen.getByText(/you can only come back with a new invite/)).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByText(/This cannot be undone/)).toBeTruthy();
  click("Leave and erase");
  expect(screen.getByText("This browser has left Atelier Morel")).toBeTruthy();
});

it("enabling the lock requires matching passwords", () => {
  render(<MyIdentityPage />);
  click(/Lock this browser/);
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "atelier" } });
  fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "ateleir" } });
  click("Turn on lock");
  expect(screen.getByRole("alert").textContent).toBe("The passwords don't match.");
  fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "atelier" } });
  click("Turn on lock");
  click(/Lock now/);
  expect(screen.getByText("This browser is locked")).toBeTruthy();
});
