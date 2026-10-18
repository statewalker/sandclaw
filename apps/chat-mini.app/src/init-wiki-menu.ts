import { type AppContext, defineAction, provideAction } from "@statewalker/kernel.core";
import { BookOpenText } from "lucide-react";
import { NewChatSessionCommand } from "./init-new-session.js";

/**
 * Contributes a "Wiki" menu. There is no standalone wiki search/results panel yet,
 * so the entry opens a chat session — where the agent, steered (by `init-wiki`) to
 * prefer the `wiki_search`/`wiki_ask` tools, answers questions about the bound wikis.
 * Same command as the Chat menu's "New session"; a no-op until the runtime is ready.
 */
export default function initWikiMenu(ctx: AppContext): () => void {
  return provideAction(
    ctx,
    defineAction(
      NewChatSessionCommand,
      {},
      { id: "wiki:ask", menu: "Wiki", order: 10, label: "Ask the wiki…", icon: BookOpenText },
    ),
  );
}
