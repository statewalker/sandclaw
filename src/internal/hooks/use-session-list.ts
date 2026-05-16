import { AgentRuntimeAdapter } from "@statewalker/ai-agent-runtime";
import { useAdapterValue } from "@statewalker/core-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export const SESSIONS_QUERY_KEY = ["chat-mini", "sessions"] as const;

export interface SessionListEntry {
  id: string;
  title?: string;
  updatedAt?: string;
}

export function useSessionList(): {
  data: SessionListEntry[] | undefined;
  isLoading: boolean;
  error: unknown;
  refresh: () => void;
} {
  const state = useAdapterValue(AgentRuntimeAdapter, (a) => a.getState());
  const runtime = state.status === "ready" ? state.runtime : undefined;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: async (): Promise<SessionListEntry[]> => {
      if (!runtime) return [];
      const list = await runtime.listSessions();
      return [...list].sort((a, b) => {
        const at = a.updatedAt ?? "";
        const bt = b.updatedAt ?? "";
        return bt.localeCompare(at);
      });
    },
    enabled: !!runtime,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
  }, [queryClient]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refresh,
  };
}

export function useInvalidateSessions(): () => void {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY }),
    [queryClient],
  );
}
