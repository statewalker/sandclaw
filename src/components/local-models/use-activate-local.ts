import type {
  ActivationProgress,
  ModelManager,
} from "@statewalker/ai-agent/models";
import { useCallback, useRef, useState } from "react";

export interface ActivateState {
  /** Catalog key currently being activated, or null when idle. */
  activatingKey: string | null;
  /** Latest progress event from the activate iterator. */
  progress: ActivationProgress | null;
  /** Last error (cleared on a fresh `activate(...)` call). */
  error: Error | null;
}

const initial: ActivateState = {
  activatingKey: null,
  progress: null,
  error: null,
};

/**
 * Drive `manager.activate(key)` with React state. Iterates the async
 * generator, mapping each {@link ActivationProgress} to UI state. Returns
 * `activate(key)` and `cancel()` actions plus a per-tick progress object.
 *
 * The hook does **not** persist the user's selection — callers do that on
 * the `ready` resolution.
 */
export function useActivateLocal(manager: ModelManager | null): {
  state: ActivateState;
  activate: (key: string) => Promise<boolean>;
  cancel: () => void;
} {
  const [state, setState] = useState<ActivateState>(initial);
  const activeKeyRef = useRef<string | null>(null);

  const activate = useCallback(
    async (key: string): Promise<boolean> => {
      if (!manager) return false;
      activeKeyRef.current = key;
      setState({ activatingKey: key, progress: null, error: null });
      try {
        for await (const progress of manager.activate(key)) {
          if (activeKeyRef.current !== key) break; // cancelled / superseded
          setState((prev) => ({ ...prev, progress }));
          if (progress.phase === "error") {
            setState({
              activatingKey: null,
              progress,
              error: progress.error ?? new Error(progress.message),
            });
            activeKeyRef.current = null;
            return false;
          }
        }
        setState((prev) => ({ ...prev, activatingKey: null }));
        activeKeyRef.current = null;
        return true;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        setState({ activatingKey: null, progress: null, error });
        activeKeyRef.current = null;
        return false;
      }
    },
    [manager],
  );

  const cancel = useCallback(() => {
    const key = activeKeyRef.current;
    if (!key) return;
    manager?.cancel(key);
    activeKeyRef.current = null;
    setState((prev) => ({ ...prev, activatingKey: null }));
  }, [manager]);

  return { state, activate, cancel };
}
