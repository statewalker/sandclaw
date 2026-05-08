import type { Intent, Intents } from "@statewalker/shared-intents";
import type { Slots } from "@statewalker/shared-slots";

const TRACE_KEY = "chat-mini:bus-trace";

function isTraceEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(TRACE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Install development-only trace logging on the workspace's
 * `Intents` and `Slots` buses. Off by default; enable via
 * `localStorage.setItem("chat-mini:bus-trace", "1")` in the
 * browser console. When disabled, `installBusTrace` returns a
 * no-op disposer and adds NO per-call overhead — the
 * `_handlers` Map's iteration is unaffected, the only change
 * is one extra wrapper in front of the dispatcher methods.
 */
export function installBusTrace(intents: Intents, slots: Slots): () => void {
  if (!isTraceEnabled()) return () => {};

  // ── Intents trace ────────────────────────────────────────────
  // Wrap the addHandler method so we can record the registration
  // order. (The Intents class doesn't expose a hook for "claimed
  // by which handler" directly, so we instrument addHandler to
  // wrap each handler with a logger that fires on claim.)
  const originalAddHandler = intents.addHandler.bind(intents);
  let registerOrder = 0;
  intents.addHandler = function tracedAddHandler<P, R>(
    key: string,
    handler: (intent: Intent<P, R>) => boolean,
  ): () => void {
    const order = registerOrder++;
    const wrapped = (intent: Intent<P, R>): boolean => {
      const claimed = handler(intent);
      if (claimed) {
        console.debug("[chat-mini:bus-trace] intent claimed", {
          key: intent.key,
          payload: intent.payload,
          handlerOrder: order,
        });
      }
      return claimed;
    };
    return originalAddHandler(key, wrapped);
  };

  // ── Slots trace ──────────────────────────────────────────────
  const originalProvide = slots.provide.bind(slots);
  slots.provide = function tracedProvide<T>(key: string, value: T): () => void {
    console.debug("[chat-mini:bus-trace] slot provide", { key, value });
    const undo = originalProvide(key, value);
    return () => {
      console.debug("[chat-mini:bus-trace] slot dispose", { key, value });
      undo();
    };
  };

  return () => {
    // Restore prototypes — the wrappers reference closures over
    // `originalAddHandler` / `originalProvide`, so removing the
    // own-property restores the prototype methods.
    delete (intents as unknown as { addHandler?: unknown }).addHandler;
    delete (slots as unknown as { provide?: unknown }).provide;
  };
}
