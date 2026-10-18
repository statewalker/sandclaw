import { defineContextAdapter } from "@statewalker/kernel.core";
import { QueryClient } from "@tanstack/react-query";

/**
 * Context adapter for the React Query `QueryClient` the React mount uses.
 * The host sets it (`queryClientAdapter.set(ctx, client)`) to choose its own
 * defaults; `initCoreReact` and any fragment that invalidates queries read it
 * with `queryClientAdapter.get(ctx)`.
 *
 * Lazy default: callers that don't pre-set the client (e.g. tests that
 * exercise `<App/>` in isolation) get a fresh client with no retries and no
 * refetch on window focus.
 */
export const queryClientAdapter = defineContextAdapter<QueryClient>(
  "core-react:query-client",
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    }),
);

export function getQueryClient(ctx: Record<string, unknown>): QueryClient {
  return queryClientAdapter.get(ctx);
}
