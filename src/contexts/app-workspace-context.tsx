import type { Workspace } from "@statewalker/workspace-api";
import { createContext, type ReactNode, useContext } from "react";

const AppWorkspaceContext = createContext<Workspace | null>(null);

interface AppWorkspaceProviderProps {
  workspace: Workspace;
  children: ReactNode;
}

/**
 * Provides the application-wide `Workspace` instance from
 * `@statewalker/workspace-api` to React consumers. The Workspace
 * is created and opened in `main.tsx` BEFORE React mounts; this
 * provider only carries the already-open instance into the React
 * tree.
 *
 * This is distinct from chat-mini's pre-existing `WorkspaceContext`
 * (`workspace-context.tsx`), which is the chat-mini-specific React
 * surface for the directory-handle lifecycle. The two contexts have
 * different concerns and different hook names — `useAppWorkspace()`
 * for the umbrella's adapter host, `useWorkspace()` for chat-mini's
 * directory-handle UI.
 */
export function AppWorkspaceProvider({
  workspace,
  children,
}: AppWorkspaceProviderProps): ReactNode {
  return (
    <AppWorkspaceContext.Provider value={workspace}>
      {children}
    </AppWorkspaceContext.Provider>
  );
}

export function useAppWorkspace(): Workspace {
  const ws = useContext(AppWorkspaceContext);
  if (!ws) {
    throw new Error(
      "useAppWorkspace must be used inside <AppWorkspaceProvider>.",
    );
  }
  return ws;
}
