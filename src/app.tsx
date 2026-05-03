import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { WorkspaceProvider } from "@/contexts/workspace-context";
import { AppRoutes } from "@/router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

export function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </WorkspaceProvider>
    </QueryClientProvider>
  );
}
