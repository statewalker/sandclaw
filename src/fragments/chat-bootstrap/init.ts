import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import { CatalogRegistry } from "../catalog-registry/index.js";
import { SpecStore } from "../spec-store/index.js";
import { CHAT_CATALOG_ENTRY, CHAT_CATALOG_ID, makeChatSpec } from "./catalog.js";

const CHAT_SPEC_ID = "spec:chat";

/**
 * Register the `chat` catalog in `CatalogRegistry` and allocate
 * the persistent chat spec in `SpecStore`. After this fragment
 * runs, any `JsonPanel` mounting a spec with `catalogId: "chat"`
 * resolves to the imperative `<ChatRoot>` tree, and the
 * deterministic `spec:chat` is reachable via `SpecStore.get`.
 *
 * The spec is created here (boot-time) rather than in a React
 * `useEffect` so it exists BEFORE any React render — including
 * layout-restore paths where DockView mounts a JsonPanel
 * synchronously during its first commit. A React effect would
 * race the layout-restore and yield the "Spec missing" placeholder
 * on reload.
 *
 * Boot order: register AFTER `initCatalogRegistry`, AFTER
 * `initSpecStore`, AFTER `initDockFragment` (so the dock host is
 * wired first), and BEFORE React mounts.
 */
export function initChatBootstrap(ctx: Record<string, unknown>): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const catalogs = workspace.requireAdapter(CatalogRegistry);
  const store = workspace.requireAdapter(SpecStore);

  register(catalogs.register(CHAT_CATALOG_ID, CHAT_CATALOG_ENTRY));

  // Idempotent: if hot-reload re-runs init or the spec already
  // exists for any other reason, skip the create.
  if (!store.get(CHAT_SPEC_ID)) {
    store.create({
      id: CHAT_SPEC_ID,
      catalogId: CHAT_CATALOG_ID,
      spec: makeChatSpec(),
      meta: { persistent: true },
    });
  }
  register(() => store.delete(CHAT_SPEC_ID));

  return cleanup;
}
