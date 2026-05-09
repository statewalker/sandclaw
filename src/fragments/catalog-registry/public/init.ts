import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import { CatalogRegistry } from "../public/catalog-registry.js";

/**
 * Attach a `CatalogRegistry` to the workspace. After this fragment
 * runs, every other fragment can resolve the registry via
 * `workspace.requireAdapter(CatalogRegistry)` and contribute catalogs
 * to it. Returns the cleanup; LIFO via shared-registry releases the
 * adapter binding on shutdown.
 */
export default function initCatalogRegistry(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  // Eagerly instantiate so consumers don't race the lazy adapter creation.
  workspace.requireAdapter(CatalogRegistry);
  return cleanup;
}
