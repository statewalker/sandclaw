import { useSyncExternalStore } from "react";
import type { DeliveredMessage } from "./flue.js";
import { isFlueRunning, type MockFlueSession } from "./flue-runtime.js";

// Messages the user wrote that are not in the conversation yet: queued behind
// the running answer, or not sent because the Sandclaw machine did not answer.
// Flue itself queues messages sent during a run, but a message queued there can
// no longer be taken back; holding them here lets the user remove one. Failed
// sends mirror `useFlueAgent().failedSends`: kept, to retry or remove.

export interface PendingSend {
  id: string;
  message: DeliveredMessage;
  /** `queued`: sent when the current answer ends. `failed`: admission failed. */
  state: "queued" | "failed";
}

export interface FlueOutbox {
  getPending(): PendingSend[];
  subscribe(listener: () => void): () => void;
  /** Sends now, queues while an answer runs, or keeps the message as failed. */
  send(message: DeliveredMessage): void;
  retry(id: string): void;
  remove(id: string): void;
}

export interface FlueOutboxOptions {
  /** Resend failed messages by themselves once the machine answers again. */
  autoRetry?: boolean;
}

export function createFlueOutbox(
  session: MockFlueSession,
  { autoRetry = false }: FlueOutboxOptions = {},
): FlueOutbox {
  let pending: PendingSend[] = [];
  let seq = 0;
  const listeners = new Set<() => void>();
  const set = (next: PendingSend[]) => {
    pending = next;
    for (const l of listeners) l();
  };
  const running = () => isFlueRunning(session.getState());
  const admit = (message: DeliveredMessage) => {
    try {
      session.send(message);
      return true;
    } catch {
      return false;
    }
  };
  /** Sends the next eligible message when no answer runs. */
  const drain = () => {
    while (!running()) {
      const next = pending.find(
        (p) => p.state === "queued" || (autoRetry && session.isOnline() && p.state === "failed"),
      );
      if (!next) return;
      if (admit(next.message)) set(pending.filter((p) => p !== next));
      else set(pending.map((p) => (p === next ? { ...p, state: "failed" } : p)));
    }
  };
  // Deferred: the session notifies from inside its own update.
  session.subscribe(() => queueMicrotask(drain));

  return {
    getPending: () => pending,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(message) {
      if (running()) set([...pending, { id: `out_${++seq}`, message, state: "queued" }]);
      else if (!admit(message)) set([...pending, { id: `out_${++seq}`, message, state: "failed" }]);
    },
    retry(id) {
      const item = pending.find((p) => p.id === id);
      if (!item) return;
      if (running()) set(pending.map((p) => (p === item ? { ...p, state: "queued" } : p)));
      else if (admit(item.message)) set(pending.filter((p) => p !== item));
    },
    remove(id) {
      set(pending.filter((p) => p.id !== id));
    },
  };
}

export function useFlueOutbox(outbox: FlueOutbox): PendingSend[] {
  return useSyncExternalStore(outbox.subscribe, outbox.getPending);
}
