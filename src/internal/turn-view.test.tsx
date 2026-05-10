import {
  createAgentNodeFactory,
  NodeType,
  type Session,
  type Turn,
} from "@statewalker/ai-agent/state";
import { Slots } from "@statewalker/shared-slots";
import { Workspace } from "@statewalker/workspace-api";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { provideTurnBlock, STANDARD_TURN_BLOCK_KINDS } from "@repo/chat-mini.chat";
import initChatViews from "@repo/chat-mini.chat-react";
import initCoreViews, { ViewRegistry } from "@statewalker/core-react";
import { AppWorkspaceProvider } from "@statewalker/core-react";
import { TurnView } from "./turn-view.js";

function makeSession(): Session {
  const factory = createAgentNodeFactory();
  return factory({ type: NodeType.session, props: {} }) as Session;
}

function newWorkspace(): Workspace {
  return new Workspace();
}

function mount(ws: Workspace, ui: ReactElement) {
  return render(
    <AppWorkspaceProvider workspace={ws}>{ui}</AppWorkspaceProvider>,
  );
}

describe("TurnView slot dispatch", () => {
  let cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    for (const fn of cleanups.reverse()) await fn();
    cleanups = [];
  });

  it("renders built-in turn-block kinds (user, agent, error) via slot + ViewRegistry", () => {
    const ws = newWorkspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    cleanups.push(initCoreViews(ctx));
    cleanups.push(initChatViews(ctx));

    const session = makeSession();
    const turn = session.addTurn();
    turn.addUserMessage("hello there");
    turn.addAgentMessage();
    turn.recordError("boom");

    const utils = mount(ws, <TurnView turn={turn as Turn} />);
    expect(utils.getByText("hello there")).toBeTruthy();
    expect(utils.getByText("boom")).toBeTruthy();
    cleanups.push(() => utils.unmount());
  });

  it("groups consecutive tool calls into one Tool calls block", async () => {
    const ws = newWorkspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    cleanups.push(initCoreViews(ctx));
    cleanups.push(initChatViews(ctx));

    const session = makeSession();
    const turn = session.addTurn();
    turn.addToolCall("c1", "read");
    turn.addToolCall("c2", "write");

    const utils = mount(ws, <TurnView turn={turn as Turn} />);
    // ToolCallsRunBlock renders a "Tool calls (2)" label for two
    // consecutive calls; verifies grouping went through the slot.
    expect(utils.getByText(/Tool calls \(2\)/i)).toBeTruthy();
    cleanups.push(() => utils.unmount());
  });

  it("plug-in registered BEFORE built-ins overrides the built-in viewKey", () => {
    const ws = newWorkspace();
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };
    cleanups.push(initCoreViews(ctx));

    // Register the plug-in BEFORE chat-views init so first-claim
    // wins for ERROR kind.
    const slots = ws.requireAdapter(Slots);
    const registry = ws.requireAdapter(ViewRegistry);
    const customViewKey = "plugin:citation-view";
    const PluginView = ({ props }: { props: unknown }) => (
      <span data-testid="citation">{(props as { text: string }).text}</span>
    );
    cleanups.push(
      registry.register(
        customViewKey,
        PluginView as unknown as Parameters<typeof registry.register>[1],
      ) as () => void,
    );
    cleanups.push(
      provideTurnBlock(slots, {
        kind: STANDARD_TURN_BLOCK_KINDS.ERROR,
        viewKey: customViewKey,
      }),
    );
    cleanups.push(initChatViews(ctx));

    const session = makeSession();
    const turn = session.addTurn();
    turn.recordError("override me");

    const utils = mount(ws, <TurnView turn={turn as Turn} />);
    expect(utils.getByTestId("citation").textContent).toBe("override me");
    cleanups.push(() => utils.unmount());
  });
});
