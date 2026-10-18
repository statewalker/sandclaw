// @vitest-environment jsdom
import { defineAction, getSlots, handleCommand, provideAction } from "@statewalker/kernel.core";
import { Command, passthrough } from "@statewalker/shared-commands";
import { AppWorkspaceProvider } from "@statewalker/ui.view.react";
import { Workspace } from "@statewalker/workspace.core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Plus } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceContext } from "./boot-common.js";
import { menubarItemsSlot } from "./extension-points.js";
import { Menubar } from "./menubar.js";

const Create = Command.async("test:create")
  .input(passthrough<{ name: string }>())
  .output(passthrough<void>())
  .build();

function setup() {
  const workspace = new Workspace();
  const ctx = createWorkspaceContext(workspace);
  render(
    <AppWorkspaceProvider workspace={workspace}>
      <Menubar />
    </AppWorkspaceProvider>,
  );
  return ctx;
}

afterEach(cleanup);

describe("Menubar", () => {
  it("shows kernel actions by menu and runs their command on click", async () => {
    const ctx = setup();
    const calls: string[] = [];
    handleCommand(ctx, Create, ({ name }) => {
      calls.push(name);
    });
    act(() => {
      provideAction(
        ctx,
        defineAction(
          Create,
          { name: "note" },
          { id: "new-note", menu: "File", label: "New note", icon: Plus },
        ),
      );
      // Palette-only actions (no menu) stay out of the menubar.
      provideAction(
        ctx,
        defineAction(Create, { name: "hidden" }, { id: "hidden", label: "Hidden" }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /File/ }));
    expect(screen.queryByText("Hidden")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /New note/ }));
    });
    expect(calls).toEqual(["note"]);
  });

  it("keeps showing legacy menubar items next to actions", () => {
    const ctx = setup();
    act(() => {
      getSlots(ctx).provide(menubarItemsSlot, {
        id: "legacy",
        menu: "File",
        label: "Legacy item",
        Icon: Plus,
        onActivate: () => {},
      });
      provideAction(
        ctx,
        defineAction(Create, { name: "x" }, { id: "a", menu: "File", label: "Action item" }),
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /File/ }));
    // One menu, sorted by (order, id) across both sources.
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent)).toEqual([
      "Action item",
      "Legacy item",
    ]);
  });
});
