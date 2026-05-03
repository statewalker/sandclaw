import type { ModelManager, ModelState } from "@statewalker/ai-agent/models";
import { useMemo, useSyncExternalStore } from "react";

/**
 * Subscribe to per-model status snapshots from a `ModelStateStore`.
 * `getStates()` builds a fresh Map on each call, so we cache it between
 * notifies — that way `useSyncExternalStore`'s `Object.is` snapshot check
 * doesn't see a new reference every render.
 */
export function useModelStatuses(
  manager: ModelManager,
): ReadonlyMap<string, ModelState> {
  const { subscribe, getSnapshot } = useMemo(() => {
    let cached: Map<string, ModelState> | null = manager.store.getStates();
    return {
      subscribe(cb: () => void): () => void {
        return manager.store.onUpdate(() => {
          cached = null;
          cb();
        });
      },
      getSnapshot(): Map<string, ModelState> {
        if (cached === null) cached = manager.store.getStates();
        return cached;
      },
    };
  }, [manager]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
