import { getWorkspace } from "@statewalker/workspace-api";
import { ViewRegistry } from "./view-registry.js";

/**
 * Renderer-fragment init for core-views (per ADR 0002). Owns the
 * `ViewRegistry` workspace adapter — the string-keyed React
 * component lookup that other renderer fragments (chat-views,
 * providers-views, ...) populate, and that consumer slots
 * (chat:turn-blocks, chat:composer-actions) resolve viewKeys
 * through.
 *
 * Eagerly instantiates the adapter so consumers don't race the
 * lazy-creation path on `requireAdapter`.
 *
 * Future scope: this init also activates `@json-render/shadcn`'s
 * prebuilt component bindings into `CatalogRegistry` and mounts
 * the React root + App component. Both deferred — for now,
 * mounting still happens in `main.tsx` so the existing app
 * continues to work while the architecture migrates.
 */
export function initCoreViews(ctx: Record<string, unknown>): () => void {
  const workspace = getWorkspace(ctx);
  workspace.requireAdapter(ViewRegistry);
  return () => {};
}
