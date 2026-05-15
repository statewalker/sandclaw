import {
  createAgentNodeFactory,
  type Message,
  NodeType,
  type SessionState,
} from "@statewalker/ai-agent/state";
import { AppWorkspaceProvider } from "@statewalker/core-react";
import { VisualizeFileCommand } from "@statewalker/files";
import { Commands } from "@statewalker/shared-commands";
import { Workspace } from "@statewalker/workspace";
import { act, fireEvent, render } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageView } from "./message-view.js";

function makeSession(): SessionState {
  const factory = createAgentNodeFactory();
  return factory({ type: NodeType.session, props: {} }) as SessionState;
}

function makeAssistantMessage(session: SessionState): Message {
  const turn = session.addTurn();
  turn.addUserMessage("hello");
  return turn.addAgentMessage();
}

function makeUserMessage(session: SessionState, text: string): Message {
  return session.addTurn().addUserMessage(text);
}

/**
 * Render `MessageView` inside a React Profiler that counts its commit
 * passes. Counts both initial and update commits — subtract the
 * baseline to get update count.
 */
function makeProfiledMessageView(): {
  Component: (props: { id: string; message: Message }) => React.ReactElement;
  getCount: (id: string) => number;
} {
  const counts = new Map<string, number>();
  const onRender: ProfilerOnRenderCallback = (id) => {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  function Component({ id, message }: { id: string; message: Message }) {
    return (
      <Profiler id={id} onRender={onRender}>
        <MessageView message={message} />
      </Profiler>
    );
  }
  return { Component, getCount: (id) => counts.get(id) ?? 0 };
}

function renderWithWorkspace(
  ui: React.ReactElement,
  ws: Workspace = new Workspace(),
): ReturnType<typeof render> {
  return render(
    <AppWorkspaceProvider workspace={ws}>{ui}</AppWorkspaceProvider>,
  );
}

describe("MessageView streaming re-render", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("each appendDelta re-renders exactly one MessageView", () => {
    const session = makeSession();
    const streamingMessage = makeAssistantMessage(session);
    // Sibling assistant message — must NOT re-render when the streaming
    // message is updated.
    const otherMessage = makeAssistantMessage(session);

    const profiled = makeProfiledMessageView();
    const utils = renderWithWorkspace(
      <>
        <profiled.Component id="streaming" message={streamingMessage} />
        <profiled.Component id="other" message={otherMessage} />
      </>,
    );
    cleanup = () => utils.unmount();

    const base = {
      streaming: profiled.getCount("streaming"),
      other: profiled.getCount("other"),
    };

    // Stream 100 deltas — each in its own `act` so React commits between
    // them, mirroring per-network-frame streaming.
    for (let i = 0; i < 100; i += 1) {
      act(() => {
        streamingMessage.appendDelta("x");
      });
    }

    // The streaming MessageView re-renders once per delta.
    expect(profiled.getCount("streaming") - base.streaming).toBe(100);
    // The sibling assistant MessageView re-renders zero times — its
    // content didn't change, and `useNodeContent` bails out.
    expect(profiled.getCount("other") - base.other).toBe(0);
    // Final content is what we'd expect.
    expect(streamingMessage.text).toBe("x".repeat(100));
  });

  it("adding a thinking-block child causes a small bounded number of re-renders", () => {
    const session = makeSession();
    const message = makeAssistantMessage(session);

    const profiled = makeProfiledMessageView();
    const utils = renderWithWorkspace(
      <profiled.Component id="msg" message={message} />,
    );
    cleanup = () => utils.unmount();
    const base = profiled.getCount("msg");

    act(() => {
      message.addThinkingBlock();
    });

    // Children-list change → bounded re-renders via
    // `useNodeChildren(message)`. The exact count depends on how the
    // tree implements `addChild` (one notification for the child added,
    // optionally one for the child's first content). What matters is
    // that it doesn't avalanche.
    const renders = profiled.getCount("msg") - base;
    expect(renders).toBeGreaterThanOrEqual(1);
    expect(renders).toBeLessThanOrEqual(3);
  });
});

describe("MessageView file:// linkifier", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("renders file:// URIs in message text as anchors that fire runVisualizeFile on click", () => {
    const session = makeSession();
    const message = makeUserMessage(
      session,
      "Open file:///abs/path/to/foo.md please.",
    );
    const ws = new Workspace();
    const intents = ws.requireAdapter(Commands);

    const visualize = vi.fn();
    const dispose = intents.listen(VisualizeFileCommand, (intent) => {
      visualize(intent.payload);
      intent.resolve();
      return true;
    });

    const utils = renderWithWorkspace(<MessageView message={message} />, ws);
    cleanup = () => {
      utils.unmount();
      dispose();
    };

    const anchor = utils.container.querySelector(
      'a[href="file:///abs/path/to/foo.md"]',
    );
    expect(anchor).not.toBeNull();
    expect(anchor?.textContent).toBe("file:///abs/path/to/foo.md");

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(anchor as Element, event);

    expect(event.defaultPrevented).toBe(true);
    expect(visualize).toHaveBeenCalledWith({
      uri: "file:///abs/path/to/foo.md",
    });
  });
});
