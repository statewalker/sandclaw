import { Slots } from "@statewalker/shared-slots";
import { Workspace } from "@statewalker/workspace-api";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { provideComposerAction } from "@repo/chat-mini.chat";
import initCoreReact from "@statewalker/core-react/fragment";
import { newViewRegistry } from "@statewalker/core-react";
import { AppWorkspaceProvider } from "@statewalker/core-react";
import { Composer } from "./composer.js";

function mount(ws: Workspace, ui: ReactElement) {
  return render(
    <AppWorkspaceProvider workspace={ws}>{ui}</AppWorkspaceProvider>,
  );
}

describe("Composer composer-actions slot", () => {
  let cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    for (const fn of cleanups.reverse()) await fn();
    cleanups = [];
  });

  it("renders a contributed action via ViewRegistry", () => {
    const ws = new Workspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    cleanups.push(initCoreReact(ctx));

    const registry = newViewRegistry(ws);
    const slots = ws.requireAdapter(Slots);

    cleanups.push(
      registry.register("plugin:fake-picker", () => (
        <button type="button" data-testid="fake-picker">
          fake picker
        </button>
      )) as () => void,
    );
    cleanups.push(
      provideComposerAction(slots, {
        id: "plugin:fake-picker",
        viewKey: "plugin:fake-picker",
        position: "leading",
      }),
    );

    const utils = mount(
      ws,
      <Composer
        onSend={() => {}}
        onStop={() => {}}
        running={false}
        disabled={false}
      />,
    );
    expect(utils.getByTestId("fake-picker")).toBeTruthy();
    // Built-in Send button still renders.
    expect(utils.getByLabelText("Send")).toBeTruthy();
    cleanups.push(() => utils.unmount());
  });

  it("sorts contributions by order within each position", () => {
    const ws = new Workspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    cleanups.push(initCoreReact(ctx));

    const registry = newViewRegistry(ws);
    const slots = ws.requireAdapter(Slots);
    cleanups.push(
      registry.register("plugin:a", () => (
        <span data-testid="lead-a">A</span>
      )) as () => void,
    );
    cleanups.push(
      registry.register("plugin:b", () => (
        <span data-testid="lead-b">B</span>
      )) as () => void,
    );
    cleanups.push(
      provideComposerAction(slots, {
        id: "a",
        viewKey: "plugin:a",
        position: "leading",
        order: 200,
      }),
    );
    cleanups.push(
      provideComposerAction(slots, {
        id: "b",
        viewKey: "plugin:b",
        position: "leading",
        order: 50,
      }),
    );

    const utils = mount(
      ws,
      <Composer
        onSend={() => {}}
        onStop={() => {}}
        running={false}
        disabled={false}
      />,
    );
    const a = utils.getByTestId("lead-a");
    const b = utils.getByTestId("lead-b");
    // b (order 50) should come before a (order 200) in DOM order.
    const cmp = a.compareDocumentPosition(b);
    // eslint-disable-next-line no-bitwise
    expect(cmp & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    cleanups.push(() => utils.unmount());
  });
});
