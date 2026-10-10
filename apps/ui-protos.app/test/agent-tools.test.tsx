import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AccessSettings,
  agentToolList,
  effectiveAccess,
  type ToolSource,
} from "../src/agent-tools/access-model.js";
import { AgentTools } from "../src/agent-tools/agent-tools.js";

afterEach(cleanup);

const files: ToolSource = {
  id: "files",
  title: "Files",
  kind: "basic",
  loaded: true,
  commands: [
    { key: "files:read", label: "Read a file" },
    { key: "files:delete", label: "Delete a file", risk: "deletes" },
  ],
};
const sheet: ToolSource = {
  id: "sheet",
  title: "Spreadsheet app",
  kind: "app",
  loaded: true,
  commands: [
    { key: "sheet:read", label: "Read cells" },
    { key: "sheet:chart", label: "Add a chart" },
  ],
};
const [read, del] = files.commands as [ToolSource["commands"][0], ToolSource["commands"][0]];
const allKnown: AccessSettings = {
  groups: {},
  commands: {},
  known: ["files:read", "files:delete", "sheet:read", "sheet:chart"],
};

describe("effective access", () => {
  it("basic commands are allowed, risky ones and apps ask", () => {
    expect(effectiveAccess(files, read, allKnown)).toBe("allow");
    expect(effectiveAccess(files, del, allKnown)).toBe("ask");
    expect(effectiveAccess(sheet, sheet.commands[0] as typeof read, allKnown)).toBe("ask");
  });

  it("command override, then group setting, then default", () => {
    const grouped = { ...allKnown, groups: { files: "block" as const } };
    expect(effectiveAccess(files, read, grouped)).toBe("block");
    expect(effectiveAccess(files, del, grouped)).toBe("block");
    const overridden = { ...grouped, commands: { "files:read": "allow" as const } };
    expect(effectiveAccess(files, read, overridden)).toBe("allow");
  });

  it("a command not seen yet asks, even when its group is allowed", () => {
    const settings = { groups: { sheet: "allow" as const }, commands: {}, known: [] };
    expect(effectiveAccess(sheet, sheet.commands[0] as typeof read, settings)).toBe("ask");
  });
});

it("the agent's tool list leaves blocked commands out and flags asking ones", () => {
  const settings = { ...allKnown, commands: { "sheet:chart": "block" as const } };
  expect(agentToolList([files, sheet], settings)).toEqual([
    { key: "files:read", label: "Read a file", description: undefined, ask: false },
    { key: "files:delete", label: "Delete a file", description: undefined, ask: true },
    { key: "sheet:read", label: "Read cells", description: undefined, ask: true },
  ]);
  expect(agentToolList([files, { ...sheet, loaded: false }], allKnown)).toHaveLength(2);
});

const control = (name: string) => screen.getByRole("group", { name: `Access for ${name}` });
const pressed = (name: string) =>
  within(control(name))
    .getAllByRole("button")
    .find((b) => b.getAttribute("aria-pressed") === "true")?.textContent;

it("a group setting applies to its commands unless overridden", () => {
  render(<AgentTools sources={[files]} settings={allKnown} />);
  fireEvent.click(within(control("Read a file")).getByRole("button", { name: "Ask" }));
  fireEvent.click(within(control("Files")).getByRole("button", { name: "Block" }));
  expect(pressed("Delete a file")).toBe("Block");
  expect(pressed("Read a file")).toBe("Ask");
  fireEvent.click(screen.getByRole("button", { name: "Follow the group" }));
  expect(pressed("Read a file")).toBe("Block");
});

it("an app that is not loaded is greyed and keeps the choices made for it", () => {
  const { rerender } = render(<AgentTools sources={[files, sheet]} settings={allKnown} />);
  fireEvent.click(within(control("Add a chart")).getByRole("button", { name: "Block" }));
  rerender(<AgentTools sources={[files, { ...sheet, loaded: false }]} settings={allKnown} />);
  expect(screen.getByText("Not loaded now — your choices are kept")).toBeTruthy();
  expect(pressed("Add a chart")).toBe("Block");
  expect(screen.getByText(/can use/).textContent).toMatch(/use 2 commands/);
});

it("new commands are announced and ask until the user decides", () => {
  const settings = {
    groups: { sheet: "allow" as const },
    commands: {},
    known: ["files:read", "files:delete"],
  };
  render(<AgentTools sources={[files, sheet]} settings={settings} />);
  const notice = screen.getByRole("status");
  expect(notice.textContent).toMatch("Spreadsheet app added 2 commands — they ask each time");
  expect(pressed("Read cells")).toBe("Ask");
  fireEvent.click(within(notice).getByRole("button", { name: "Got it" }));
  expect(screen.queryByRole("status")).toBeNull();
  expect(pressed("Read cells")).toBe("Allow");
});

it("reset to defaults drops every choice", () => {
  render(<AgentTools sources={[files]} settings={allKnown} />);
  const reset = screen.getByRole("button", { name: "Reset to defaults" }) as HTMLButtonElement;
  expect(reset.disabled).toBe(true);
  fireEvent.click(within(control("Files")).getByRole("button", { name: "Block" }));
  fireEvent.click(reset);
  expect(pressed("Read a file")).toBe("Allow");
  expect(pressed("Delete a file")).toBe("Ask");
  expect(pressed("Files")).toBeUndefined();
});
