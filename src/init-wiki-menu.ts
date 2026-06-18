import { menubarItemsSlot } from "@repo/app-shell";
import { OpenChatSessionCommand } from "@repo/chat-mini.chat";
import { ActiveModel, AgentRuntimeAdapter } from "@statewalker/ai-agent-runtime";
import { Commands } from "@statewalker/shared-commands";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace.core";
import type { QueryClient } from "@tanstack/react-query";
import { BookOpenText } from "lucide-react";

// Mirrors `chat-mini.chat-react`'s `SESSIONS_QUERY_KEY` (kept private there).
const SESSIONS_QUERY_KEY = ["chat-mini", "sessions"] as const;

/**
 * Contributes a "Wiki" menu. There is no standalone wiki search/results panel yet,
 * so the entry opens a chat session — where the agent, steered (by `init-wiki`) to
 * prefer the `wiki_search`/`wiki_ask` tools, answers questions about the bound wikis.
 * Mirrors `init-chat-menu`'s "New session" flow. A no-op until the runtime is ready.
 */
export default function initWikiMenu(ctx: Record<string, unknown>): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);
  const commands = workspace.requireAdapter(Commands);
  const queryClient = ctx["core-react:query-client"] as QueryClient | undefined;

  const [register, cleanup] = newRegistry();

  register(
    slots.provide(menubarItemsSlot, {
      id: "wiki:ask",
      menu: "Wiki",
      order: 10,
      label: "Ask the wiki…",
      Icon: BookOpenText,
      onActivate: async () => {
        const state = workspace.requireAdapter(AgentRuntimeAdapter).getState();
        if (state.status !== "ready") return;
        const session = state.agent.createSession();
        await session.save();
        const hint = workspace.requireAdapter(ActiveModel).get();
        if (hint?.providerId && hint.modelId) {
          await state.runtime.setSessionModelRef(session.id, {
            connectionId: hint.providerId,
            modelId: hint.modelId,
          });
        }
        queryClient?.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
        await commands.call(OpenChatSessionCommand, { sessionId: session.id }).promise;
      },
    }),
  );

  return cleanup;
}
