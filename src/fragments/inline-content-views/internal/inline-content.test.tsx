import { Intents } from "@statewalker/shared-intents";
import { Slots } from "@statewalker/shared-slots";
import { Workspace } from "@statewalker/workspace-api";
import { fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { handleLoadDirectory, handleVisualizeFile } from "@/fragments/files";
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
  it("registers all five built-ins under stable ids", async () => {
    const ws = new Workspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    const cleanup = initInlineContentViews(ctx);

    const registry = ws.requireAdapter(InlineContentRegistry);
    expect(registry.get("metric-card")).not.toBeNull();
    expect(registry.get("line-chart")).not.toBeNull();
    expect(registry.get("file-card")).not.toBeNull();
    expect(registry.get("directory-card")).not.toBeNull();
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
      "directory-card",
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

  it("DirectoryCard renders explicit entries without firing runLoadDirectory", async () => {
    const ws = new Workspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    const cleanup = initInlineContentViews(ctx);
    const intents = ws.requireAdapter(Intents);

    const loadDir = vi.fn();
    const disposeLoad = handleLoadDirectory(intents, (intent) => {
      loadDir(intent.payload);
      intent.resolve([]);
      return true;
    });

    const utils = mount(
      ws,
      <InlineContent
        spec={{
          componentId: "directory-card",
          props: {
            uri: "file:///docs",
            name: "docs",
            entries: [
              { name: "a.md", kind: "file" },
              { name: "sub", kind: "directory" },
            ],
          },
        }}
      />,
    );

    expect(utils.getByText("docs")).toBeTruthy();
    expect(utils.getByText("a.md")).toBeTruthy();
    expect(utils.getByText("sub/")).toBeTruthy();
    expect(loadDir).not.toHaveBeenCalled();

    utils.unmount();
    disposeLoad();
    await cleanup();
  });

  it("DirectoryCard lazy-loads entries via runLoadDirectory when entries are omitted", async () => {
    const ws = new Workspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    const cleanup = initInlineContentViews(ctx);
    const intents = ws.requireAdapter(Intents);

    const loadDir = vi.fn();
    const disposeLoad = handleLoadDirectory(intents, (intent) => {
      loadDir(intent.payload);
      intent.resolve([
        { name: "a.md", path: "/docs/a.md", kind: "file" },
        { name: "sub", path: "/docs/sub", kind: "directory" },
      ]);
      return true;
    });

    const utils = mount(
      ws,
      <InlineContent
        spec={{
          componentId: "directory-card",
          props: { uri: "file:///docs" },
        }}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadDir).toHaveBeenCalledTimes(1);
    expect(loadDir).toHaveBeenCalledWith({ path: "/docs", recursive: false });
    expect(utils.getByText("a.md")).toBeTruthy();
    expect(utils.getByText("sub/")).toBeTruthy();

    utils.unmount();
    disposeLoad();
    await cleanup();
  });

  it("DirectoryCard fires runVisualizeFile when an entry is clicked", async () => {
    const ws = new Workspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    const cleanup = initInlineContentViews(ctx);
    const intents = ws.requireAdapter(Intents);

    const visualize = vi.fn();
    const disposeVisualize = handleVisualizeFile(intents, (intent) => {
      visualize(intent.payload);
      intent.resolve();
      return true;
    });

    const utils = mount(
      ws,
      <InlineContent
        spec={{
          componentId: "directory-card",
          props: {
            uri: "file:///docs",
            entries: [
              { name: "a.md", kind: "file" },
              { name: "sub", kind: "directory" },
            ],
          },
        }}
      />,
    );

    fireEvent.click(utils.getByText("a.md"));
    fireEvent.click(utils.getByText("sub/"));

    expect(visualize).toHaveBeenCalledTimes(2);
    expect(visualize).toHaveBeenNthCalledWith(1, { uri: "file:///docs/a.md" });
    expect(visualize).toHaveBeenNthCalledWith(2, { uri: "file:///docs/sub" });

    utils.unmount();
    disposeVisualize();
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
