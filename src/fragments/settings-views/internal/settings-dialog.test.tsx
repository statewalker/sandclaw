/// <reference types="@testing-library/jest-dom" />
import "@testing-library/jest-dom/vitest";
import { Intents } from "@statewalker/shared-intents";
import { Slots } from "@statewalker/shared-slots";
import {
  getWorkspace,
  Workspace,
  type Workspace as WorkspaceType,
} from "@statewalker/workspace-api";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import initCoreViews, { ViewRegistry } from "@/fragments/core-views";
import initSettings, {
  provideSettingsTab,
  runOpenSettings,
  Settings,
} from "@/fragments/settings";
import { AppWorkspaceProvider } from "@/fragments/workspace-bridge-views";
import { SettingsDialog } from "./settings-dialog.js";

interface Harness {
  ws: WorkspaceType;
  cleanup: () => Promise<void>;
}

function bootHarness(): Harness {
  const ws = new Workspace();
  const ctx: Record<string, unknown> = { "workspace:workspace": ws };
  const cleanups: Array<() => void | Promise<void>> = [];
  cleanups.push(initCoreViews(ctx));
  cleanups.push(initSettings(ctx));
  return {
    ws: getWorkspace(ctx),
    cleanup: async () => {
      for (const fn of cleanups.reverse()) await fn();
    },
  };
}

let active: Harness | null = null;
afterEach(async () => {
  if (active) await active.cleanup();
  active = null;
});

describe("SettingsDialog", () => {
  it("renders nothing when Settings.isOpen is false", () => {
    active = bootHarness();
    render(
      <AppWorkspaceProvider workspace={active.ws}>
        <SettingsDialog />
      </AppWorkspaceProvider>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a contributed tab appears in the dialog left rail and renders its viewKey", async () => {
    active = bootHarness();
    const { ws } = active;
    const slots = ws.requireAdapter(Slots);
    const registry = ws.requireAdapter(ViewRegistry);
    const intents = ws.requireAdapter(Intents);
    void ws.requireAdapter(Settings);

    function TestPanel(): React.ReactElement {
      return <div data-testid="test-panel">Contributed tab content</div>;
    }
    registry.register("test:settings-tab", TestPanel as never);
    provideSettingsTab(slots, {
      id: "test",
      title: "Test Tab",
      viewKey: "test:settings-tab",
    });

    render(
      <AppWorkspaceProvider workspace={ws}>
        <SettingsDialog />
      </AppWorkspaceProvider>,
    );

    await act(async () => {
      await runOpenSettings(intents, { tabId: "test" }).promise;
    });

    expect(screen.getByText("Test Tab")).toBeInTheDocument();
    expect(screen.getByTestId("test-panel")).toBeInTheDocument();
  });

  it("falls back to a placeholder when a tab's viewKey is unbound", async () => {
    active = bootHarness();
    const { ws } = active;
    const slots = ws.requireAdapter(Slots);
    const intents = ws.requireAdapter(Intents);

    provideSettingsTab(slots, {
      id: "orphan",
      title: "Orphan",
      viewKey: "unbound:view",
    });

    render(
      <AppWorkspaceProvider workspace={ws}>
        <SettingsDialog />
      </AppWorkspaceProvider>,
    );

    await act(async () => {
      await runOpenSettings(intents, { tabId: "orphan" }).promise;
    });

    expect(screen.getByText(/no component is bound/i)).toBeInTheDocument();
  });
});
