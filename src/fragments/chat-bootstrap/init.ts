import { Intents } from "@statewalker/shared-intents";
import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import { CatalogRegistry } from "../catalog-registry/index.js";
import { runShowDockPanel } from "../dock/intents.js";
import { SpecStore } from "../spec-store/index.js";
import {
  CHAT_CATALOG_ENTRY,
  CHAT_CATALOG_ID,
  chatPanelId,
  chatSpecId,
  makeChatSpec,
} from "./catalog.js";
import { handleOpenChatSession } from "./intents.js";
import { restoreChatSpecsFromLayout } from "./layout-restore.js";

const LAYOUT_KEY = "chat-mini:dock-layout";

/**
 * Register the `chat` catalog in `CatalogRegistry`, register the
 * `chat:open-session` intent handler, and pre-allocate chat specs
 * for any chat-shaped panel ids in the persisted dock layout (so
 * restored tabs render their content without flashing the
 * `PanelMissing` placeholder). No singleton `spec:chat` is created
 * — chat specs are now per-session and allocated on demand by the
 * handler.
 *
 * Boot order: register AFTER `initCatalogRegistry`, AFTER
 * `initSpecStore`, AFTER `initDockFragment`, BEFORE React mounts.
 */
export function initChatBootstrap(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const catalogs = workspace.requireAdapter(CatalogRegistry);
  const store = workspace.requireAdapter(SpecStore);
  const intents = workspace.requireAdapter(Intents);

  register(catalogs.register(CHAT_CATALOG_ID, CHAT_CATALOG_ENTRY));

  // Pre-allocate specs for chat panels saved in the dock layout
  // so the dock host's `fromJSON` finds them ready. Runs AFTER
  // `SpecStore` is registered (above) and BEFORE the React tree
  // mounts the DockView host.
  restoreChatSpecsFromLayout(store, globalThis.localStorage, LAYOUT_KEY);

  register(
    handleOpenChatSession(intents, (intent) => {
      const { sessionId } = intent.payload;
      const specId = chatSpecId(sessionId);
      if (!store.get(specId)) {
        store.create({
          id: specId,
          catalogId: CHAT_CATALOG_ID,
          spec: makeChatSpec(sessionId),
          meta: { persistent: true },
        });
      }
      runShowDockPanel(intents, {
        panelId: chatPanelId(sessionId),
        specId,
      })
        .promise.then(() => intent.resolve())
        .catch((error: unknown) => intent.reject(error));
      return true;
    }),
  );

  return cleanup;
}
