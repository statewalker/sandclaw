import {
  type AppendMessage,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { useMemo, useSyncExternalStore } from "react";
import type {
  DeliveredMessage,
  FlueConversationMessage,
  FlueConversationPart,
  FlueConversationSettlement,
} from "./flue.js";

// A mock Flue session and the bridge from Flue's materialized conversation to an
// assistant-ui runtime. The session stands in for `useFlueAgent()`: it exposes the
// same `messages` + `settlements` and accepts the same `DeliveredMessage`, so only
// this file changes when the real agent is wired in.

/** The materialized conversation, as `useFlueAgent()` / `observe()` exposes it. */
export interface FlueState {
  messages: FlueConversationMessage[];
  settlements: FlueConversationSettlement[];
}

/**
 * A scripted agent: for one delivered message, the successive states of its reply.
 * Each step replaces the reply's parts, the way a Flue observation re-materializes
 * a streaming response (text grows, a tool call moves to `output-available`).
 */
export type ScriptedAgent = (message: DeliveredMessage) => FlueConversationPart[][];

export interface MockFlueSession {
  getState(): FlueState;
  subscribe(listener: () => void): () => void;
  /** `client.send()`: admits the message; the reply arrives later. */
  send(message: DeliveredMessage): { submissionId: string };
  /** `client.abort()`: stops the running submission and any queued behind it. */
  abort(): { aborted: boolean };
}

export interface MockFlueSessionOptions {
  agent: ScriptedAgent;
  /** Milliseconds between reply steps; 0 in tests. */
  delay?: number;
  /** A conversation that already happened. */
  initial?: Partial<FlueState>;
}

export function createMockFlueSession({
  agent,
  delay = 600,
  initial,
}: MockFlueSessionOptions): MockFlueSession {
  let state: FlueState = {
    messages: initial?.messages ?? [],
    settlements: initial?.settlements ?? [],
  };
  const listeners = new Set<() => void>();
  const queue: { submissionId: string; steps: FlueConversationPart[][] }[] = [];
  let running: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  const now = () => new Date().toISOString();
  const update = (next: Partial<FlueState>) => {
    state = { ...state, ...next };
    for (const l of listeners) l();
  };
  const settle = (submissionId: string, outcome: FlueConversationSettlement["outcome"]) =>
    update({ settlements: [...state.settlements, { submissionId, outcome, timestamp: now() }] });
  const setReply = (submissionId: string, parts: FlueConversationPart[]) => {
    const id = `msg_${submissionId}`;
    const exists = state.messages.some((m) => m.id === id);
    const reply: FlueConversationMessage = {
      id,
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      submissionId,
      timestamp: now(),
      parts,
    };
    update({
      messages: exists
        ? state.messages.map((m) => (m.id === id ? { ...reply, timestamp: m.timestamp } : m))
        : [...state.messages, reply],
    });
  };

  const runNext = () => {
    const next = queue.shift();
    running = next?.submissionId;
    if (!next) return;
    const step = (i: number) => {
      timer = setTimeout(() => {
        const parts = next.steps[i];
        if (parts) setReply(next.submissionId, parts);
        if (i + 1 < next.steps.length) return step(i + 1);
        settle(next.submissionId, "completed");
        runNext();
      }, delay);
    };
    step(0);
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(message) {
      const submissionId = `sub_${++seq}_${Date.now()}`;
      update({
        messages: [
          ...state.messages,
          {
            id: `msg_in_${submissionId}`,
            role: message.kind === "user" ? "user" : "system",
            purpose: message.kind === "user" ? "user" : "dispatch",
            display: message.kind === "user" ? "visible" : "hidden",
            submissionId,
            timestamp: now(),
            parts: [{ type: "text", text: message.body, state: "done" }],
          },
        ],
      });
      queue.push({ submissionId, steps: agent(message) });
      if (!running) runNext();
      return { submissionId };
    },
    abort() {
      const stopped = [running, ...queue.map((q) => q.submissionId)].filter(
        (id): id is string => id !== undefined,
      );
      if (stopped.length === 0) return { aborted: false };
      clearTimeout(timer);
      queue.length = 0;
      running = undefined;
      for (const submissionId of stopped) {
        // A reply cut short keeps what was written, closed.
        update({
          messages: [
            ...state.messages.map((m) =>
              m.submissionId === submissionId && m.role === "assistant"
                ? { ...m, parts: m.parts.map(closePart) }
                : m,
            ),
            {
              id: `msg_abort_${submissionId}`,
              role: "system",
              purpose: "advisory",
              display: "diagnostic",
              submissionId,
              settlement: { outcome: "aborted" },
              timestamp: now(),
              parts: [{ type: "text", text: "Stopped.", state: "done" }],
            },
          ],
        });
        settle(submissionId, "aborted");
      }
      return { aborted: true };
    },
  };
}

const closePart = (p: FlueConversationPart): FlueConversationPart =>
  (p.type === "text" || p.type === "reasoning") && p.state === "streaming"
    ? { ...p, state: "done" }
    : p;

/** A submission without a settlement is still running (Flue's `isRunning`). */
export function isFlueRunning({ messages, settlements }: FlueState): boolean {
  const settled = new Set(settlements.map((s) => s.submissionId));
  return messages.some((m) => m.submissionId !== undefined && !settled.has(m.submissionId));
}

/** One Flue message → one assistant-ui message, parts mapped one to one. */
export function convertFlueMessage(message: FlueConversationMessage): ThreadMessageLike {
  const content = message.parts.flatMap((part): Exclude<ThreadMessageLike["content"], string> => {
    switch (part.type) {
      case "text":
        return [{ type: "text", text: part.text }];
      case "reasoning":
        return [{ type: "reasoning", text: part.text }];
      case "file":
        if (!part.url) return [];
        return part.mediaType.startsWith("image/")
          ? [{ type: "image", image: part.url, filename: part.filename }]
          : [{ type: "file", data: part.url, mimeType: part.mediaType, filename: part.filename }];
      case "dynamic-tool": {
        const base = {
          type: "tool-call" as const,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args: (part.input ?? {}) as Record<string, never>,
        };
        if (part.state === "output-available") return [{ ...base, result: part.output }];
        if (part.state === "output-error")
          return [{ ...base, result: part.errorText, isError: true }];
        return [base];
      }
      default:
        // `data-<name>` parts pass through under their own type.
        return [{ type: part.type, data: (part as { data: unknown }).data }];
    }
  });
  return {
    id: message.id,
    role: message.role,
    content,
    createdAt: message.timestamp ? new Date(message.timestamp) : undefined,
  };
}

const textOf = (message: AppendMessage) =>
  message.content
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("\n")
    .trim();

/**
 * An assistant-ui runtime over a Flue session: only `visible` messages are shown,
 * `isRunning` is a submission without settlement, sending delivers a `user`
 * message, cancel aborts. No edit, reload or branching: a Flue session is linear.
 */
export function useFlueRuntime(session: MockFlueSession) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const messages = useMemo(
    () => state.messages.filter((m) => m.display === "visible"),
    [state.messages],
  );
  return useExternalStoreRuntime({
    messages,
    isRunning: isFlueRunning(state),
    convertMessage: convertFlueMessage,
    onNew: async (message) => {
      session.send({ kind: "user", body: textOf(message) });
    },
    onCancel: async () => {
      session.abort();
    },
  });
}
