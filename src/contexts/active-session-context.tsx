import type { Session } from "@statewalker/ai-agent/runtime";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router";
import { useRuntime } from "@/contexts/runtime-context";
import { setSessionModel } from "@/services/session-utils";

const SESSION_PARAM = "s";

export interface ActiveSession {
  session: Session | undefined;
  sessionId: string | undefined;
  isLoading: boolean;
  error: string | null;
  /** Open an existing session by id (loads from disk if needed). */
  open: (id: string) => void;
  /** Create a new in-memory session and focus it. */
  createNew: () => void;
  /** Clear the active session (return to empty state). */
  clear: () => void;
}

const ActiveSessionContext = createContext<ActiveSession | null>(null);

/**
 * Single provider that owns the focused-session state. Both
 * `<SessionsPanel>` and `<ChatPanel>` must consume the same instance —
 * otherwise calling `createNew()` from one component and observing the
 * URL change from another causes the second component to try and load
 * the brand-new (unsaved) session from disk, which trips
 * `applyFlat: no root candidate in stream`.
 */
export function ActiveSessionProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const { state } = useRuntime();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get(SESSION_PARAM) ?? undefined;
  const [session, setSession] = useState<Session | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sessions just created in memory but not yet saved to disk. The URL
  // effect must NOT call `runtime.loadSession()` for these.
  const localOnlyRef = useRef<Session | null>(null);

  const setParam = useCallback(
    (id: string | undefined) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set(SESSION_PARAM, id);
          else next.delete(SESSION_PARAM);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (state.status !== "ready") {
      setSession(undefined);
      return;
    }
    if (!sessionId) {
      setSession(undefined);
      return;
    }

    const local = localOnlyRef.current;
    if (local && local.id === sessionId) {
      setSession(local);
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
        if (state.activeModelId) {
          setSessionModel(loaded, state.activeModelId);
        }
        if (!cancelled) setSession(loaded);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setSession(undefined);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, sessionId]);

  const open = useCallback(
    (id: string) => {
      localOnlyRef.current = null;
      setParam(id);
    },
    [setParam],
  );

  const createNew = useCallback(() => {
    if (state.status !== "ready") return;
    const fresh = state.agent.createSession();
    localOnlyRef.current = fresh;
    setSession(fresh);
    setParam(fresh.id);
  }, [state, setParam]);

  const clear = useCallback(() => {
    localOnlyRef.current = null;
    setSession(undefined);
    setParam(undefined);
  }, [setParam]);

  const value = useMemo<ActiveSession>(
    () => ({ session, sessionId, isLoading, error, open, createNew, clear }),
    [session, sessionId, isLoading, error, open, createNew, clear],
  );

  return (
    <ActiveSessionContext.Provider value={value}>
      {children}
    </ActiveSessionContext.Provider>
  );
}

export function useActiveSession(): ActiveSession {
  const ctx = useContext(ActiveSessionContext);
  if (!ctx) {
    throw new Error(
      "useActiveSession must be used inside <ActiveSessionProvider>.",
    );
  }
  return ctx;
}
