import { type AppContext, defineAction, provideAction } from "@statewalker/kernel.core";
import { MessageSquarePlus } from "lucide-react";
import { NewChatSessionCommand } from "./init-new-session.js";

/**
 * Contributes the chat app's own "Chat" menu (ordered before Files/System).
 * "New session" mirrors the sidebar's New button through
 * `chat-mini:new-session`.
 */
export default function initChatMenu(ctx: AppContext): () => void {
  return provideAction(
    ctx,
    defineAction(
      NewChatSessionCommand,
      {},
      {
        id: "chat-mini:new-session",
        menu: "Chat",
        order: 10,
        label: "New session",
        icon: MessageSquarePlus,
      },
    ),
  );
}
