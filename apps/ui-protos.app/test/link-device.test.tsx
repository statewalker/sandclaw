import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { LinkDevices, type LinkDevicesProps } from "../src/link-device/link-device.js";

afterEach(cleanup);

const fast = { exchangeMs: 0, sendMs: 0 };
const click = (name: string | RegExp, scope: HTMLElement = document.body) =>
  fireEvent.click(within(scope).getByRole("button", { name }));
const sides = () => {
  const [keeper, mover] = screen.getAllByRole("figure");
  if (!keeper || !mover) throw new Error("two devices expected");
  return { keeper, mover };
};

/** Plays the flow up to the code on both devices. */
async function toCompare(props: LinkDevicesProps = {}) {
  render(<LinkDevices {...fast} {...props} />);
  click("Link a device");
  const { mover } = sides();
  click(/Scan the code|Open the link/, mover);
  click("Link this device", mover);
  await screen.findAllByText("482 193");
  return sides();
}

it("both devices show the same code", async () => {
  const { keeper, mover } = await toCompare();
  expect(within(keeper).getByText("482 193")).toBeTruthy();
  expect(within(mover).getByText("482 193")).toBeTruthy();
});

it("confirming on one device only does not finish", async () => {
  const { keeper, mover } = await toCompare();
  click("Yes, it's the same code", keeper);
  expect(within(keeper).getByText("Waiting for your other device…")).toBeTruthy();
  expect(screen.queryByText(/is now one of your devices/)).toBeNull();
  expect(within(mover).getByRole("button", { name: "Yes, it's the same code" })).toBeTruthy();
});

it("confirming on both devices finishes and names the new device", async () => {
  const { keeper, mover } = await toCompare();
  click("Yes, it's the same code", keeper);
  click("Yes, it's the same code", mover);
  expect(
    await within(keeper).findByText("Safari on iPhone is now one of your devices"),
  ).toBeTruthy();
  expect(within(mover).getByText("This phone is now Claire Morel's")).toBeTruthy();
});

it("the merge compare step says which name is kept and what stays", async () => {
  const { mover } = await toCompare({ linkCase: "merge" });
  expect(
    within(mover).getByText(
      "Hugo B. will become Hugo Benali; files and chats on this device stay.",
    ),
  ).toBeTruthy();
});

it("a second device trying the link ends it with nothing shared", async () => {
  render(<LinkDevices {...fast} fail="taken" />);
  click("Link a device");
  const { keeper, mover } = sides();
  click("Scan the code", mover);
  click("Link this device", mover);
  expect(await within(keeper).findByText("Someone else tried to use the link")).toBeTruthy();
  expect(within(keeper).getByText(/Nothing was shared/)).toBeTruthy();
  expect(within(mover).getByText(/Nothing was shared/)).toBeTruthy();
});
