import { ActiveModel, AgentRuntimeAdapter } from "@statewalker/ai-agent-runtime.core";
import { OpenChatSessionCommand } from "@statewalker/chat-mini.chat";
import { type AppContext, callCommand, handleCommand } from "@statewalker/kernel.core";
import { Command, passthrough } from "@statewalker/shared-commands";
import { queryClientAdapter } from "@statewalker/ui.view.react";
import { getWorkspace } from "@statewalker/workspace.core";

// Mirrors `chat-mini.chat-react`'s `SESSIONS_QUERY_KEY` (kept private there).
const SESSIONS_QUERY_KEY = ["chat-mini", "sessions"] as const;

/**
 * `chat-mini:new-session` — create and persist a session, inherit the active
 * model as its `modelRef`, refresh the session list and open it. Resolves
 * with the new session id, or `null` while the agent runtime is not `ready`
 * (no model selected yet). The Chat and Wiki menus both call it.
 */
export const NewChatSessionCommand = Command.async("chat-mini:new-session")
  .input(passthrough<Record<string, never>>())
  .output(passthrough<{ sessionId: string } | null>())
  .label("New session")
  .build();

export default function initNewSession(ctx: AppContext): () => void {
  const workspace = getWorkspace(ctx);
  return handleCommand(ctx, NewChatSessionCommand, async () => {
    const state = workspace.requireAdapter(AgentRuntimeAdapter).getState();
    if (state.status !== "ready") return null;
    const session = state.agent.createSession();
    await session.save();
    const hint = workspace.requireAdapter(ActiveModel).get();
    if (hint?.providerId && hint.modelId) {
      await state.runtime.setSessionModelRef(session.id, {
        connectionId: hint.providerId,
        modelId: hint.modelId,
      });
    }
    void queryClientAdapter.get(ctx).invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
    await callCommand(ctx, OpenChatSessionCommand, { sessionId: session.id });
    return { sessionId: session.id };
  });
}
