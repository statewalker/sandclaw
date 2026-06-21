import { menubarItemsSlot } from "@repo/app-shell";
import { OpenChatSessionCommand } from "@repo/chat-mini.chat";
import {
  ActiveModel,
  AgentRuntimeAdapter,
} from "@statewalker/ai-agent-runtime.core";
import { Commands } from "@statewalker/shared-commands";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace.core";
import type { QueryClient } from "@tanstack/react-query";
import { MessageSquarePlus } from "lucide-react";

// Mirrors `chat-mini.chat-react`'s `SESSIONS_QUERY_KEY` (kept private there).
const SESSIONS_QUERY_KEY = ["chat-mini", "sessions"] as const;

/**
 * Contributes the chat app's own "Chat" menu (ordered before Files/System).
 * "New session" mirrors the sidebar's New button: create + persist a session,
 * inherit the active model as its `modelRef`, refresh the session list, and
 * open it. A no-op until the agent runtime is `ready` (a model is selected).
 */
export default function initChatMenu(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);
  const commands = workspace.requireAdapter(Commands);
  const queryClient = ctx["core-react:query-client"] as QueryClient | undefined;

  const [register, cleanup] = newRegistry();

  register(
    slots.provide(menubarItemsSlot, {
      id: "chat-mini:new-session",
      menu: "Chat",
      order: 10,
      label: "New session",
      Icon: MessageSquarePlus,
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
        await commands.call(OpenChatSessionCommand, { sessionId: session.id })
          .promise;
      },
    }),
  );

  return cleanup;
}
