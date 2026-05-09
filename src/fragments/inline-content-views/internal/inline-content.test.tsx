import { Slots } from "@statewalker/shared-slots";
import { Workspace } from "@statewalker/workspace-api";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import {
  type InlineComponentDescriptor,
  InlineContentRegistry,
  observeInlineComponents,
} from "@/fragments/inline-content";
import { AppWorkspaceProvider } from "@/fragments/workspace-bridge-views";
import initInlineContentViews from "../public/init.js";
import { InlineContent } from "../public/inline-content.js";

function mount(ws: Workspace, ui: ReactElement) {
  return render(
    <AppWorkspaceProvider workspace={ws}>{ui}</AppWorkspaceProvider>,
  );
}

describe("inline-content-views built-ins", () => {
  it("registers all four built-ins under stable ids", async () => {
    const ws = new Workspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    const cleanup = initInlineContentViews(ctx);

    const registry = ws.requireAdapter(InlineContentRegistry);
    expect(registry.get("metric-card")).not.toBeNull();
    expect(registry.get("line-chart")).not.toBeNull();
    expect(registry.get("file-card")).not.toBeNull();
    expect(registry.get("action-button")).not.toBeNull();

    await cleanup();
    expect(registry.get("metric-card")).toBeNull();
  });

  it("contributes descriptors to inline-content:components", async () => {
    const ws = new Workspace();
    const slots = ws.requireAdapter(Slots);
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    const cleanup = initInlineContentViews(ctx);

    let descriptors: InlineComponentDescriptor[] = [];
    const dispose = observeInlineComponents(slots, (vs) => {
      descriptors = vs;
    });
    expect(descriptors.map((d) => d.id).sort()).toEqual([
      "action-button",
      "file-card",
      "line-chart",
      "metric-card",
    ]);
    dispose();
    await cleanup();
  });

  it("renders MetricCard via InlineContent", async () => {
    const ws = new Workspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    const cleanup = initInlineContentViews(ctx);

    const utils = mount(
      ws,
      <InlineContent
        spec={{
          componentId: "metric-card",
          props: {
            label: "Revenue",
            value: "$12.4k",
            delta: "+4.2%",
            trend: "positive",
          },
        }}
      />,
    );
    expect(utils.getByText("Revenue")).toBeTruthy();
    expect(utils.getByText("$12.4k")).toBeTruthy();
    expect(utils.getByText("+4.2%")).toBeTruthy();

    utils.unmount();
    await cleanup();
  });

  it("renders LineChart via InlineContent", async () => {
    const ws = new Workspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    const cleanup = initInlineContentViews(ctx);

    const utils = mount(
      ws,
      <InlineContent
        spec={{
          componentId: "line-chart",
          props: {
            values: [1, 3, 2, 5, 4],
            startLabel: "Mon",
            endLabel: "Fri",
          },
        }}
      />,
    );
    // SVG polyline element exists
    expect(utils.container.querySelector("polyline")).toBeTruthy();
    expect(utils.getByText("Mon")).toBeTruthy();
    expect(utils.getByText("Fri")).toBeTruthy();

    utils.unmount();
    await cleanup();
  });

  it("falls back to an inline error chip for unknown component ids", async () => {
    const ws = new Workspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    const cleanup = initInlineContentViews(ctx);

    const utils = mount(
      ws,
      <InlineContent spec={{ componentId: "no-such-thing", props: {} }} />,
    );
    expect(utils.getByText(/Unknown inline component/i)).toBeTruthy();

    utils.unmount();
    await cleanup();
  });

  it("plug-in: a custom component registered later renders alongside built-ins", async () => {
    const ws = new Workspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    const cleanupBuiltins = initInlineContentViews(ctx);

    // Plug-in path: register a custom component into the same
    // registry. Renders via InlineContent without any built-in
    // glue knowing about it.
    const registry = ws.requireAdapter(InlineContentRegistry);
    const disposeCustom = registry.register("plugin:badge", ({ props }) => (
      <span data-testid="plugin-badge">{(props as { text: string }).text}</span>
    ));

    const utils = mount(
      ws,
      <InlineContent
        spec={{ componentId: "plugin:badge", props: { text: "BETA" } }}
      />,
    );
    expect(utils.getByTestId("plugin-badge").textContent).toBe("BETA");

    utils.unmount();
    disposeCustom();
    await cleanupBuiltins();
  });
});
