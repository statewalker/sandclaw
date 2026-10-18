import type { ViewModel } from "@statewalker/explorer.core";
import { useSyncExternalStore } from "react";

/**
 * Subscribes a component to a `ViewModel`'s `onUpdate` notifications.
 *
 * Returns a monotonically-increasing version counter so consumers
 * can `useMemo`/`useEffect` on it. The counter is internal — most
 * callers ignore the return value and just call `model.<getter>()`
 * directly in render after subscribing.
 */
export function useViewModel(model: ViewModel): number {
  return useSyncExternalStore(
    (notify) => model.onUpdate(notify),
    () => model.version,
    () => model.version,
  );
}
