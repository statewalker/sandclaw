import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  type Connector,
  catalog,
  choicesFor,
  connectors,
  defaultPermission,
  newConnector,
  revoke,
  revokeEffects,
  type SignInResult,
  setPermission,
  stateOf,
  validateAddress,
} from "../src/connectors/connector-model.js";
import { Connectors } from "../src/connectors/connectors.js";
import { today } from "../src/mock.js";

afterEach(cleanup);

const [mail, calendar, drive] = connectors as [Connector, Connector, Connector];

describe("stateOf", () => {
  it("reads the sign-in and the service", () => {
    expect(stateOf(mail, today)).toBe("connected");
    expect(stateOf(calendar, today)).toBe("expired");
    expect(stateOf(drive, today)).toBe("down");
    expect(stateOf(revoke(mail), today)).toBe("not-connected");
    expect(stateOf({ ...mail, connecting: true }, today)).toBe("connecting");
  });

  it("an expired sign-in wins over a service that is down", () => {
    expect(stateOf({ ...calendar, down: { since: today, error: "x" } }, today)).toBe("expired");
  });
});

describe("capabilities", () => {
  it("reading and drafting are allowed; sending and unknown tools ask", () => {
    expect(defaultPermission("read")).toBe("allowed");
    expect(defaultPermission("write")).toBe("allowed");
    expect(defaultPermission("send")).toBe("ask");
    expect(defaultPermission("other")).toBe("ask");
    const fresh = newConnector(catalog[0] as (typeof catalog)[number]);
    expect(fresh.capabilities.find((c) => c.id === "send")?.permission).toBe("ask");
  });

  it("sending can be set to ask or off, never allowed", () => {
    expect(choicesFor("send")).toEqual(["ask", "off"]);
    expect(setPermission(mail, "send", "allowed")).toEqual(mail);
    const off = setPermission(mail, "send", "off");
    expect(off.capabilities.find((c) => c.id === "send")?.permission).toBe("off");
  });
});

describe("revoke", () => {
  it("names what stops and what stays", () => {
    const { stops, stays } = revokeEffects(setPermission(mail, "send", "off"));
    expect(stops).toEqual(["Read your mail", "Search your mail", "Write drafts"]);
    expect(stays).toEqual(["Drafts it wrote stay in your Drafts folder."]);
  });

  it("forgets the sign-in and keeps the choices", () => {
    const after = revoke(setPermission(mail, "draft", "off"));
    expect(after.signIn).toBeUndefined();
    expect(after.capabilities.find((c) => c.id === "draft")?.permission).toBe("off");
  });
});

it("an MCP address must be https, except on this machine", () => {
  expect(validateAddress("https://tickets.example.com/mcp")).toBeUndefined();
  expect(validateAddress("http://localhost:3000/mcp")).toBeUndefined();
  expect(validateAddress("http://tickets.example.com/mcp")).toMatch(/https/);
  expect(validateAddress("tickets")).toBeTruthy();
});

describe("Connectors", () => {
  it("connect: waits for the popup, then shows the account", async () => {
    let finish: (r: SignInResult) => void = () => {};
    const signIn = () => new Promise<SignInResult>((resolve) => (finish = resolve));
    render(<Connectors connectors={[]} signIn={signIn} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a connector" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect Mail" }));
    expect(screen.getByRole("status").textContent).toMatch(/sign in to Mail in the popup/);
    finish({ account: "ines@example.com" });
    expect(await screen.findByText("ines@example.com")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
  });

  it("revoke asks first, then leaves the connector not connected", () => {
    render(<Connectors connectors={[mail]} />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Drafts it wrote stay in your Drafts folder.")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));
    expect(screen.getByText("Not connected")).toBeTruthy();
  });

  it("changing a capability; sending offers no “Allowed”", () => {
    render(<Connectors connectors={[mail]} />);
    const drafts = screen.getByRole("group", { name: "Write drafts" });
    fireEvent.click(within(drafts).getByRole("button", { name: "Off" }));
    expect(within(drafts).getByRole("button", { name: "Off" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    const send = screen.getByRole("group", { name: "Send mail" });
    expect(within(send).queryByRole("button", { name: "Allowed" })).toBeNull();
  });
});
