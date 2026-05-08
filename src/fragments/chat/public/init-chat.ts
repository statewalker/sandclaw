import { getWorkspace } from "@statewalker/workspace-api";
import { ChatManager } from "../internal/chat.manager.js";

/**
 * Logic-fragment init for chat. Constructs a `ChatManager` which
 * registers the `chat:open-session` intent handler and runs the
 * layout-restore pass.
 *
 * Boot order: register AFTER `initSpecStore` and AFTER `initDock`.
 * Catalog registration is the responsibility of `chat-views`'s init,
 * which runs after all logic fragments per ADR 0002.
 */
export function initChat(ctx: Record<string, unknown>): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const manager = new ChatManager({ workspace });
  return () => manager.close();
}
