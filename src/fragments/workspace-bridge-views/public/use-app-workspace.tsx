import type { Workspace } from "@statewalker/workspace-api";
import { createContext, type ReactNode, useContext } from "react";

const AppWorkspaceContext = createContext<Workspace | null>(null);

interface AppWorkspaceProviderProps {
  workspace: Workspace;
  children: ReactNode;
}

/**
 * Provides the application-wide `Workspace` instance from
 * `@statewalker/workspace-api` to React consumers. Per ADR 0002,
 * this React-tree glue lives in the renderer fragment
 * `workspace-bridge-views` (not in any logic fragment) — React
 * hooks routing typed contracts are contract surface in renderer
 * fragments.
 *
 * The Workspace is created in `main.tsx` BEFORE React mounts; this
 * provider only carries the already-existing instance into the
 * React tree.
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

/**
 * Read the application-wide `Workspace` from React context.
 * Throws if used outside `<AppWorkspaceProvider>`.
 */
export function useAppWorkspace(): Workspace {
  const ws = useContext(AppWorkspaceContext);
  if (!ws) {
    throw new Error(
      "useAppWorkspace must be used inside <AppWorkspaceProvider>.",
    );
  }
  return ws;
}
