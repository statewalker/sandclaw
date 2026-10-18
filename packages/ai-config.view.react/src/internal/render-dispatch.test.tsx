import { createStateStore, type Spec } from "@json-render/core";
import { AiConfigImpl, makeConnectionsInitialState } from "@statewalker/ai-config.core";
import { SpecRenderer } from "@statewalker/render.view.react";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { Secrets, Workspace } from "@statewalker/workspace.core";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildActionHandlers } from "./action-handlers.js";
import { buildConnectionsRegistry } from "./build-react-catalog.js";

class FakeSecrets extends Secrets {
  private readonly map = new Map<string, unknown>();
  async get(k: string): Promise<unknown> {
    return this.map.get(k);
  }
  async set(k: string, v: unknown): Promise<void> {
    this.map.set(k, v);
  }
  async delete(k: string): Promise<boolean> {
    return this.map.delete(k);
  }
  async list(): Promise<string[]> {
    return [...this.map.keys()];
  }
  onUpdate(): () => void {
    return () => {};
  }
}

afterEach(cleanup);

/**
 * Regression test for the dead-actions bug: json-render's `ActionProvider`
 * resolves handlers from `JSONUIProvider`'s `handlers` prop, not the registry's
 * action *schemas*. `SpecRenderer` must forward `handlers` or every dispatched
 * action no-ops ("No handler registered"). This renders a real Button-press
 * spec through `SpecRenderer` and asserts the `addConnection` handler runs.
 */
describe("SpecRenderer forwards action handlers", () => {
  it("dispatches addConnection on button press (handlers reach ActionProvider)", async () => {
    const ws = new Workspace().setFileSystem(new MemFilesApi());
    const secrets = new FakeSecrets();
    ws.setAdapter(Secrets, () => secrets);
    const aiConfig = new AiConfigImpl(ws);
    await aiConfig.load();

    const store = createStateStore(makeConnectionsInitialState());
    store.set("/ui/newConnectionType", "openai");
    const handlers = buildActionHandlers({ aiConfig, store });
    const { registry } = buildConnectionsRegistry({ actions: handlers });

    const spec: Spec = {
      root: "btn",
      elements: {
        btn: {
          type: "Button",
          props: { label: "Add", variant: "primary" },
          on: { press: [{ action: "addConnection", params: {} }] },
        },
      },
    } as Spec;

    const { getByText } = render(
      <SpecRenderer spec={spec} registry={registry} store={store} handlers={handlers} />,
    );
    fireEvent.click(getByText("Add"));

    await waitFor(() => {
      expect(aiConfig.listConnections()).toHaveLength(1);
    });
    expect(aiConfig.listConnections()[0]?.type).toBe("openai");
  });
});
