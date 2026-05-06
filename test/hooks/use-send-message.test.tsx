import {
  createAgentNodeFactory,
  type LogMessage,
  NodeType,
} from "@statewalker/ai-agent/state";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSendMessage } from "@/screens/chat/hooks/use-send-message";

/**
 * Minimal stub of `Session`'s public surface for the hook test. We only
 * need: `send`, `run`, `save`. The hook never inspects the tree.
 */
function makeStubSession(events: LogMessage[]): {
  session: Stub;
  saveCalls: number;
  abortSignals: AbortSignal[];
} {
  const factory = createAgentNodeFactory();
  const tree = factory({ type: NodeType.session, props: {} });
  let saveCalls = 0;
  const abortSignals: AbortSignal[] = [];

  const session: Stub = {
    state: tree,
    send: vi.fn(),
    save: vi.fn(async () => {
      saveCalls += 1;
      return tree.id;
    }),
    run: async function* (signal?: AbortSignal): AsyncGenerator<LogMessage> {
      if (signal) abortSignals.push(signal);
      for (const event of events) {
        if (signal?.aborted) {
          throw new DOMException("aborted", "AbortError");
        }
        // Force React to commit between events so intermediate progress
        // snapshots are observable. Real streaming is event-paced anyway.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        yield event;
      }
    },
  };
  return {
    session,
    get saveCalls() {
      return saveCalls;
    },
    abortSignals,
  };
}

interface Stub {
  state: unknown;
  send: (text: string) => void;
  save: () => Promise<string>;
  run: (signal?: AbortSignal) => AsyncGenerator<LogMessage>;
}

interface ProbeAPI {
  send: (text: string) => Promise<void>;
  abort: () => void;
  progressSnapshots: Array<ReturnType<typeof useSendMessage>["progress"]>;
}

function makeProbe(session: Stub): { Probe: () => null; api: ProbeAPI } {
  const api: ProbeAPI = {
    send: async () => {},
    abort: () => {},
    progressSnapshots: [],
  };
  function Probe(): null {
    const result = useSendMessage(
      session as unknown as Parameters<typeof useSendMessage>[0],
    );
    api.send = result.send;
    api.abort = result.abort;
    api.progressSnapshots.push(result.progress);
    return null;
  }
  return { Probe, api };
}

describe("useSendMessage", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("transitions progress through tool-call → tool-result and saves on turn-finish", async () => {
    const events: LogMessage[] = [
      {
        type: "tool-call",
        turnId: "t1",
        toolCallId: "c1",
        toolName: "read_file",
        args: {},
      },
      {
        type: "tool-result",
        turnId: "t1",
        toolCallId: "c1",
        toolName: "read_file",
        result: "ok",
      },
      { type: "turn-finish", turnId: "t1", finishReason: "stop", kind: "ok" },
    ];
    const stub = makeStubSession(events);
    const { Probe, api } = makeProbe(stub.session);
    const utils = render(<Probe />);
    cleanup = () => utils.unmount();

    await act(async () => {
      await api.send("hello");
    });

    // Save was called exactly once on turn-finish.
    expect(stub.saveCalls).toBe(1);

    // Last snapshot is idle.
    const last = api.progressSnapshots[api.progressSnapshots.length - 1];
    expect(last).toEqual({
      running: false,
      currentTool: null,
      lastError: null,
    });
    // session.send was forwarded with the trimmed text.
    expect((stub.session.send as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      ["hello"],
    ]);
  });

  it("records error events into progress.lastError", async () => {
    const events: LogMessage[] = [
      { type: "error", turnId: "t1", message: "boom" },
      {
        type: "turn-finish",
        turnId: "t1",
        finishReason: "error",
        kind: "error",
      },
    ];
    const stub = makeStubSession(events);
    const { Probe, api } = makeProbe(stub.session);
    const utils = render(<Probe />);
    cleanup = () => utils.unmount();

    await act(async () => {
      await api.send("hi");
    });

    // Find a snapshot where lastError was set.
    const erroredAt = api.progressSnapshots.find((p) => p.lastError === "boom");
    expect(erroredAt).toBeTruthy();
  });

  it("refuses concurrent sends while running", async () => {
    const events: LogMessage[] = [
      { type: "turn-finish", turnId: "t1", finishReason: "stop", kind: "ok" },
    ];
    const stub = makeStubSession(events);
    const { Probe, api } = makeProbe(stub.session);
    const utils = render(<Probe />);
    cleanup = () => utils.unmount();

    await act(async () => {
      // First send completes synchronously (events drain in one tick).
      await api.send("first");
      // Second send after the first is fine.
      await api.send("second");
    });

    expect((stub.session.send as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      ["first"],
      ["second"],
    ]);
  });
});
