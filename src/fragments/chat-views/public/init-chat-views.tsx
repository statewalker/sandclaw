import { defineRegistry, schema } from "@json-render/react";
import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import type { ComponentType } from "react";
import { CatalogRegistry } from "../../catalog-registry/index.js";
import { CHAT_CATALOG_ID, chatCatalog } from "../../chat/index.js";
import { ChatRoot } from "../internal/chat-root.js";

/**
 * Renderer-fragment init for chat-views (per ADR 0002). Builds the
 * json-render registry binding the React `ChatRoot` component to
 * the chat catalog's `ChatRoot` type, then registers the resolved
 * `CatalogEntry` into `CatalogRegistry` under id `"chat"`.
 *
 * Boot order: register AFTER `initChat` (logic) so the catalog
 * declaration exists, and BEFORE the React tree mounts the dock
 * host. Per the boot sequence in `main.tsx`, all renderer-fragment
 * inits run after all logic-fragment inits.
 */
export function initChatViews(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const catalogs = workspace.requireAdapter(CatalogRegistry);

  const { registry: chatRegistry } = defineRegistry(chatCatalog, {
    components: {
      ChatRoot: ({ props }) => <ChatRoot sessionId={props.sessionId} />,
    },
    actions: {},
  });

  register(
    catalogs.register(CHAT_CATALOG_ID, {
      catalog: chatCatalog,
      // CatalogEntry expects `Record<string, unknown>` (no React
      // dependency in the logic fragment); the cast is safe here
      // because the entry is held opaquely — `<Renderer>` consumes
      // `registry`, not this map.
      components: { ChatRoot } as Record<string, ComponentType<unknown>>,
      registry: chatRegistry,
    }),
  );

  // `schema` import keeps json-render happy in case the catalog file
  // is tree-shaken out elsewhere; the registry built above already
  // pinned it. Reference for clarity:
  void schema;

  return cleanup;
}
