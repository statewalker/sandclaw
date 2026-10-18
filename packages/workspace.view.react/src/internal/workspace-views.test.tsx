// Phase 1b coverage (task 4.4): Pattern-B behavioral tests for the three
// workspace header views. Each view is mounted under <AppWorkspaceProvider>
// with a real Workspace carrying a real WorkspaceShellAdapter and Commands
// adapter; only the collaborator commands are mocked (via commands.listen).
// Assertions drive adapter state and observe the rendered reaction — no
// component under test is mocked.
import { Commands } from "@statewalker/shared-commands";
import { AppWorkspaceProvider } from "@statewalker/ui.view.react";
import {
  ChangeWorkspaceCommand,
  WorkspaceDisconnectCommand,
  WorkspaceReconnectCommand,
  WorkspaceShellAdapter,
  type WorkspaceShellState,
} from "@statewalker/workspace.browser";
import { Workspace } from "@statewalker/workspace.core";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { ReconnectBanner } from "./reconnect-banner.js";
import { SwitchWorkspaceButton } from "./switch-workspace-button.js";
import { WorkspaceLabelHeader } from "./workspace-label-header.js";

function setup(initial: WorkspaceShellState = { status: "loading" }) {
  const ws = new Workspace();
  const shell = ws.requireAdapter(WorkspaceShellAdapter);
  shell._setState(initial);
  const commands = ws.requireAdapter(Commands);
  const mount = (ui: ReactElement) =>
    render(<AppWorkspaceProvider workspace={ws}>{ui}</AppWorkspaceProvider>);
  return { ws, shell, commands, mount };
}

describe("WorkspaceLabelHeader", () => {
  it("renders the label from a ready WorkspaceShellAdapter state", () => {
    const { shell, mount } = setup({ status: "ready", label: "my-folder" });
    const utils = mount(<WorkspaceLabelHeader />);
    expect(utils.getByText("SandClaw")).toBeTruthy();
    // Label reflects adapter state, not a hardcoded string.
    expect(utils.getByText("my-folder")).toBeTruthy();
    // Sanity: it is the adapter's value, not a coincidence.
    expect(shell.getState()).toEqual({ status: "ready", label: "my-folder" });
  });

  it("shows no folder label in states without one (loading)", () => {
    const { mount } = setup({ status: "loading" });
    const utils = mount(<WorkspaceLabelHeader />);
    // The two chrome spans (name + slash) are present but the label span is empty.
    expect(utils.queryByText("my-folder")).toBeNull();
    expect(utils.getByText("SandClaw")).toBeTruthy();
  });

  it("also surfaces the label in needs-permission (label-bearing state)", () => {
    const { mount } = setup({
      status: "needs-permission",
      label: "restore-me",
    });
    const utils = mount(<WorkspaceLabelHeader />);
    expect(utils.getByText("restore-me")).toBeTruthy();
  });

  it("reactively re-renders the label when the adapter transitions", () => {
    // A component that read getState() once (non-reactive) would keep the
    // stale empty label after the transition — this fails such an impl.
    const { shell, mount } = setup({ status: "loading" });
    const utils = mount(<WorkspaceLabelHeader />);
    expect(utils.queryByText("docs")).toBeNull();
    act(() => shell._setState({ status: "ready", label: "docs" }));
    expect(utils.getByText("docs")).toBeTruthy();
  });
});

describe("ReconnectBanner", () => {
  it("renders null in states other than needs-permission", () => {
    const { mount } = setup({ status: "ready", label: "open" });
    const utils = mount(<ReconnectBanner />);
    expect(utils.container.firstChild).toBeNull();
    expect(utils.queryByText(/Reconnect to workspace/i)).toBeNull();
  });

  it("shows the banner with the pending label in needs-permission", () => {
    const { mount } = setup({
      status: "needs-permission",
      label: "stale-folder",
    });
    const utils = mount(<ReconnectBanner />);
    expect(utils.getByText(/Reconnect to workspace/i)).toBeTruthy();
    expect(utils.getByText("stale-folder")).toBeTruthy();
  });

  it("appears only after the adapter enters needs-permission", () => {
    const { shell, mount } = setup({ status: "ready", label: "open" });
    const utils = mount(<ReconnectBanner />);
    expect(utils.container.firstChild).toBeNull();
    act(() => shell._setState({ status: "needs-permission", label: "reconnect-me" }));
    expect(utils.getByText("reconnect-me")).toBeTruthy();
  });

  it("fires WorkspaceReconnectCommand when the Reconnect button is clicked", () => {
    const { commands, mount } = setup({
      status: "needs-permission",
      label: "f",
    });
    const reconnect = vi.fn();
    commands.listen(WorkspaceReconnectCommand, (cmd) => {
      reconnect();
      cmd.resolve({});
      return true;
    });
    const utils = mount(<ReconnectBanner />);
    fireEvent.click(utils.getByRole("button", { name: /Reconnect/i }));
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
});

describe("SwitchWorkspaceButton", () => {
  it("disconnects then opens the picker (two-step, in order) on click", async () => {
    const { commands, mount } = setup();
    const order: string[] = [];
    commands.listen(WorkspaceDisconnectCommand, (cmd) => {
      order.push("disconnect");
      cmd.resolve({});
      return true;
    });
    commands.listen(ChangeWorkspaceCommand, (cmd) => {
      order.push("change");
      cmd.resolve({ workspace: new Workspace() });
      return true;
    });
    const utils = mount(<SwitchWorkspaceButton />);
    fireEvent.click(utils.getByRole("button", { name: /Switch workspace/i }));
    // Flush the two awaited command promises.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // Both fired, and disconnect strictly precedes change (ADR-0001 teardown order).
    expect(order).toEqual(["disconnect", "change"]);
  });

  it("swallows an AbortError from the picker (user cancellation) without an unhandled rejection", async () => {
    const { commands, mount } = setup();
    commands.listen(WorkspaceDisconnectCommand, (cmd) => {
      cmd.resolve({});
      return true;
    });
    commands.listen(ChangeWorkspaceCommand, (cmd) => {
      cmd.reject(new DOMException("cancelled", "AbortError"));
      return true;
    });
    const unhandled = vi.fn();
    globalThis.addEventListener("unhandledrejection", unhandled);
    const utils = mount(<SwitchWorkspaceButton />);
    fireEvent.click(utils.getByRole("button", { name: /Switch workspace/i }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    globalThis.removeEventListener("unhandledrejection", unhandled);
    // If the catch branch were removed, the AbortError would escape the
    // void-wrapped async onClick and surface as an unhandled rejection.
    expect(unhandled).not.toHaveBeenCalled();
  });
});
