import {
  createAgentNodeFactory,
  type Message,
  NodeType,
  type Session,
} from "@statewalker/ai-agent/state";
import { act, render } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MessageView } from "@/components/session-tree/message-view";

function makeSession(): Session {
  const factory = createAgentNodeFactory();
  return factory({ type: NodeType.session, props: {} }) as Session;
}

function makeAssistantMessage(session: Session): Message {
  const turn = session.addTurn();
  turn.addUserMessage("hello");
  return turn.addAgentMessage();
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
    const utils = render(
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
    const utils = render(<profiled.Component id="msg" message={message} />);
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
