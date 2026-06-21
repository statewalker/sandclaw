import type { Session } from "@statewalker/ai-agent.core/runtime";
import { AgentRuntimeAdapter } from "@statewalker/ai-agent-runtime.core";
import { useAdapterValue } from "@statewalker/ui.view.react";
import { useEffect, useState } from "react";
import { setSessionModel } from "../session-utils.js";

export interface ChatSessionState {
  session: Session | undefined;
  isLoading: boolean;
  error: string | null;
}

/**
 * Per-tab session loader. One instance per chat panel — locks the
 * tab to its `sessionId`. Drives loading via `runtime.loadSession`
 * from `@statewalker/ai-agent` (no chat-mini-side cache); two
 * instances with different ids do not share state. The `createNew`
 * flow saves the session to disk before dispatching the open
 * command, so every tab loads through this same path.
 */
export function useChatSession(sessionId: string): ChatSessionState {
  const state = useAdapterValue(AgentRuntimeAdapter, (a) => a.getState());
  const [session, setSession] = useState<Session | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status !== "ready") {
      setSession(undefined);
      setIsLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const loaded = await state.runtime.loadSession(sessionId);
        if (cancelled) return;
        // Prefer the session's own `modelRef` (per-session selection written by
        // the composer) over the workspace active model. Re-read on every
        // runtime state change, so picking a model — which also bumps the
        // active selection and rebuilds the runtime — reloads this session
        // with its current per-session model.
        const meta = await state.runtime.getSessionMetadata(sessionId);
        if (cancelled) return;
        const modelId = meta?.modelRef?.modelId || state.activeModelId;
        if (modelId) {
          setSessionModel(loaded, modelId);
        }
        setSession(loaded);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setSession(undefined);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, sessionId]);

  return { session, isLoading, error };
}
