import { chatPanelId } from "@repo/chat-mini.chat";
import { AgentRuntimeAdapter } from "@statewalker/ai-agent-runtime";
import { useAdapterValue, useAppWorkspace } from "@statewalker/ui.view.react";
import { SetPanelTitleCommand } from "@statewalker/shell.core";
import { Commands } from "@statewalker/shared-commands";
import { type ReactElement, useEffect } from "react";
import { useChatSession } from "../public/hooks/use-chat-session.js";
import { ChatPanel } from "./chat-panel.js";
import { useNodeProp } from "./hooks/use-session-node.js";

export interface ChatRootProps {
  sessionId: string;
}

const TAB_TITLE_MAX = 28;
const FALLBACK_TITLE = "Untitled";

/** Middle-ellipsis truncation: "very long string here" → "very lon…here". */
function truncateMiddle(s: string, max = TAB_TITLE_MAX): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  const tail = max - 1 - head;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/**
 * Chat panel root component (Option β from the dockview-json-render
 * vision §3.6). Each tab's `ChatRoot` is locked to ONE session id
 * via spec props — `useChatSession(sessionId)` drives loading, and
 * `<ChatPanel>` consumes the resulting `Session`. The rendered tree
 * (no-providers placeholder vs. chat panel) is unchanged from the
 * single-tab era.
 */
export function ChatRoot({ sessionId }: ChatRootProps): ReactElement {
  const state = useAdapterValue(AgentRuntimeAdapter, (a) => a.getState());
  const chatSession = useChatSession(sessionId);
  const sessionState = chatSession.session?.state;
  const showGate =
    state.status === "no-providers" || state.status === "no-active-model";
  return (
    <>
      {sessionState ? (
        <TabTitleBinder sessionId={sessionId} sessionState={sessionState} />
      ) : null}
      {showGate ? (
        <NoModelPlaceholder status={state.status} />
      ) : (
        <ChatPanel chatSession={chatSession} />
      )}
    </>
  );
}

function NoModelPlaceholder({
  status,
}: {
  status: "no-providers" | "no-active-model";
}): ReactElement {
  const title =
    status === "no-providers"
      ? "No model providers configured"
      : "No active model selected";
  const body =
    status === "no-providers"
      ? "Add a connection in the Models dialog to start chatting."
      : "Pick a model in the Models dialog to start chatting.";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}

function TabTitleBinder({
  sessionId,
  sessionState,
}: {
  sessionId: string;
  sessionState: NonNullable<
    ReturnType<typeof useChatSession>["session"]
  >["state"];
}): null {
  const workspace = useAppWorkspace();
  const commands = workspace.requireAdapter(Commands);
  const title = useNodeProp(sessionState, (s) => s.title);
  useEffect(() => {
    const display = truncateMiddle(title?.trim() || FALLBACK_TITLE);
    commands.call(SetPanelTitleCommand, {
      panelId: chatPanelId(sessionId),
      title: display,
    });
  }, [title, sessionId, commands]);
  return null;
}
