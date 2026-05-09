import type { Workspace } from "@statewalker/workspace-api";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { StrictMode } from "react";
import { AppWorkspaceProvider } from "@/fragments/workspace-bridge-views";
import { App } from "./app.js";

interface AppRootProps {
  workspace: Workspace;
  queryClient: QueryClient;
}

/**
 * Top-level React tree owned by `core-views`. Wires the boot-time
 * `Workspace` into React (via `<AppWorkspaceProvider/>`), the React
 * Query client (via `<QueryClientProvider/>`), and finally the
 * `<App/>` switch. Mounted exactly once by `core-views`' init.
 */
export function AppRoot({
  workspace,
  queryClient,
}: AppRootProps): ReactElement {
  return (
    <StrictMode>
      <AppWorkspaceProvider workspace={workspace}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </AppWorkspaceProvider>
    </StrictMode>
  );
}
