import { getWorkspace } from "@statewalker/workspace-api";
import { createRoot, type Root } from "react-dom/client";
import { AppRoot } from "../internal/app-root.js";
import { getQueryClient } from "../internal/query-client-ctx.js";
import { ViewRegistry } from "./view-registry.js";

/**
 * Renderer-fragment init for core-views (per ADR 0002 + ADR 0003).
 * Owns the React mount path:
 *
 *   1. Eagerly instantiates the `ViewRegistry` workspace adapter so
 *      consumers don't race the lazy-creation path on the first
 *      `requireAdapter` call.
 *   2. Calls `createRoot(document.getElementById('app')!).render(<AppRoot/>)`
 *      exactly once per fragment activation. The mount happens
 *      synchronously; by the time the React tree commits, every
 *      other fragment registered after `core-views` has finished
 *      its own `init` (renderer fragments register after logic
 *      fragments, per main.tsx boot order).
 *
 * Cleanup unmounts the React root so re-entrant `onLoad` /
 * `onUnload` cycles do not leak DOM.
 */
export default function initCoreViews(
  ctx: Record<string, unknown>,
): () => void {
  const workspace = getWorkspace(ctx);
  workspace.requireAdapter(ViewRegistry);

  const queryClient = getQueryClient(ctx);

  let root: Root | null = null;
  const container = document.getElementById("app");
  if (container) {
    root = createRoot(container);
    root.render(<AppRoot workspace={workspace} queryClient={queryClient} />);
  }

  return () => {
    root?.unmount();
  };
}
