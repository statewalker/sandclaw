import {
  createAgentNodeFactory,
  type Message,
  NodeType,
  type SessionState,
  type Turn,
} from "@statewalker/ai-agent/state";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useNode,
  useNodeChildren,
  useNodeContent,
  useNodeProp,
} from "./use-session-node.js";

function makeSession(): SessionState {
  const factory = createAgentNodeFactory();
  return factory({ type: NodeType.session, props: {} }) as SessionState;
}

function makeTurnWithAssistantMessage(session: SessionState): {
  turn: Turn;
  assistant: Message;
} {
  const turn = session.addTurn();
  turn.addUserMessage("hello");
  const assistant = turn.addAgentMessage();
  return { turn, assistant };
}

/** Each probe lives in its OWN component so re-renders don't coalesce. */
function makeProbe<T>(useHook: () => T): {
  Probe: () => null;
  getCount: () => number;
} {
  let count = 0;
  function Probe(): null {
    useHook();
    count += 1;
    return null;
  }
  return { Probe, getCount: () => count };
}

describe("useNodeChildren / useNodeContent / useNode", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("each appendDelta produces a re-render in content subscribers, none in structural ones", () => {
    const session = makeSession();
    const { turn, assistant } = makeTurnWithAssistantMessage(session);

    const sessionChildren = makeProbe(() => useNodeChildren(session));
    const turnChildren = makeProbe(() => useNodeChildren(turn));
    const messageChildren = makeProbe(() => useNodeChildren(assistant));
    const messageContent = makeProbe(() => useNodeContent(assistant));
    const sessionAll = makeProbe(() => useNode(session));

    const utils = render(
      <>
        <sessionChildren.Probe />
        <turnChildren.Probe />
        <messageChildren.Probe />
        <messageContent.Probe />
        <sessionAll.Probe />
      </>,
    );
    cleanup = () => utils.unmount();

    const base = {
      sessionChildren: sessionChildren.getCount(),
      turnChildren: turnChildren.getCount(),
      messageChildren: messageChildren.getCount(),
      messageContent: messageContent.getCount(),
      sessionAll: sessionAll.getCount(),
    };

    // Stream 100 deltas, each in its own act() so React commits between
    // them — mirrors the real streaming case (one delta per network frame).
    for (let i = 0; i < 100; i += 1) {
      act(() => {
        assistant.appendDelta("x");
      });
    }

    // Content subscriber MUST re-render exactly 100 times.
    expect(messageContent.getCount() - base.messageContent).toBe(100);
    // Catch-all MUST re-render 100 times too.
    expect(sessionAll.getCount() - base.sessionAll).toBe(100);
    // Structural subscribers MUST NOT re-render — children arrays are unchanged.
    expect(sessionChildren.getCount() - base.sessionChildren).toBe(0);
    expect(turnChildren.getCount() - base.turnChildren).toBe(0);
    expect(messageChildren.getCount() - base.messageChildren).toBe(0);

    // Final content reflects all deltas.
    expect(assistant.text).toBe("x".repeat(100));
  });

  it("addTurn re-renders the session structural subscriber, not message-content subscribers", () => {
    const session = makeSession();
    const { assistant } = makeTurnWithAssistantMessage(session);

    const sessionChildren = makeProbe(() => useNodeChildren(session));
    const messageContent = makeProbe(() => useNodeContent(assistant));

    const utils = render(
      <>
        <sessionChildren.Probe />
        <messageContent.Probe />
      </>,
    );
    cleanup = () => utils.unmount();
    const base = {
      sessionChildren: sessionChildren.getCount(),
      messageContent: messageContent.getCount(),
    };

    act(() => {
      session.addTurn();
    });

    expect(sessionChildren.getCount() - base.sessionChildren).toBe(1);
    expect(messageContent.getCount() - base.messageContent).toBe(0);
  });

  it("addToolCall on a turn re-renders that turn's structural subscriber once", () => {
    const session = makeSession();
    const { turn, assistant } = makeTurnWithAssistantMessage(session);

    const turnChildren = makeProbe(() => useNodeChildren(turn));
    const messageContent = makeProbe(() => useNodeContent(assistant));

    const utils = render(
      <>
        <turnChildren.Probe />
        <messageContent.Probe />
      </>,
    );
    cleanup = () => utils.unmount();
    const base = {
      turnChildren: turnChildren.getCount(),
      messageContent: messageContent.getCount(),
    };

    act(() => {
      turn.addToolCall("call-1", "read_file");
    });

    expect(turnChildren.getCount() - base.turnChildren).toBe(1);
    expect(messageContent.getCount() - base.messageContent).toBe(0);
  });

  it("useNodeProp bails out when the selected value is unchanged", () => {
    const session = makeSession();
    const isStreamingProbe = makeProbe(() =>
      useNodeProp(session, (s) => s.isStreaming),
    );

    const utils = render(<isStreamingProbe.Probe />);
    cleanup = () => utils.unmount();
    const base = isStreamingProbe.getCount();

    // Many notifications without changing isStreaming → no re-render.
    act(() => {
      for (let i = 0; i < 10; i += 1) session.notify();
    });
    expect(isStreamingProbe.getCount() - base).toBe(0);

    // startStreaming flips the flag → exactly one re-render.
    act(() => {
      session.startStreaming();
    });
    expect(isStreamingProbe.getCount() - base).toBe(1);

    // stopStreaming flips back → another re-render.
    act(() => {
      session.stopStreaming();
    });
    expect(isStreamingProbe.getCount() - base).toBe(2);
  });
});
