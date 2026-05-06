import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import { CatalogRegistry } from "../catalog-registry/index.js";
import { CHAT_CATALOG_ENTRY, CHAT_CATALOG_ID } from "./catalog.js";

/**
 * Register the `chat` catalog in `CatalogRegistry`. After this
 * fragment runs, any `JsonPanel` mounting a spec with
 * `catalogId: "chat"` resolves to the imperative `<ChatRoot>` tree.
 *
 * Boot order: register AFTER `initCatalogRegistry` and AFTER
 * `initDockFragment` (so the dock host is wired first), and
 * BEFORE any boot-time `runCreateSpec` / `runShowDockPanel` call
 * for the chat panel.
 */
export function initChatBootstrap(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const catalogs = workspace.requireAdapter(CatalogRegistry);

  register(catalogs.register(CHAT_CATALOG_ID, CHAT_CATALOG_ENTRY));

  return cleanup;
}
