import { Intents } from "@statewalker/shared-intents";
import { type ReactElement, useEffect } from "react";
import { ProviderConfigGate } from "@/components/providers/provider-config-gate";
import { useRuntime } from "@/contexts/runtime-context";
import { runSetPanelTitle } from "@/fragments/dock";
import { useAppWorkspace } from "@/fragments/workspace-bridge-views";
import { ChatPanel } from "@/screens/chat/components/chat-panel";
import { useNodeProp } from "@/screens/chat/hooks/use-session-node";
import { chatPanelId } from "../../chat/index.js";
import { useChatSession } from "./hooks/use-chat-session.js";

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
 * (provider-config gate vs. chat panel) is unchanged from the
 * single-tab era.
 *
 * Tab title binding: subscribes to the loaded session's title and
 * dispatches `dock:set-panel-title` so the DockView tab header
 * shows the chat title (truncated mid-string when long).
 */
export function ChatRoot({ sessionId }: ChatRootProps): ReactElement {
  const { state } = useRuntime();
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
        <ProviderConfigGate />
      ) : (
        <ChatPanel chatSession={chatSession} />
      )}
    </>
  );
}

/**
 * Listens for changes to `session.state.title` and pushes the
 * truncated value to the DockView tab via `dock:set-panel-title`.
 * Mounted only when the session has loaded — keeps the title-set
 * effect off the no-session render path.
 */
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
  const intents = workspace.requireAdapter(Intents);
  const title = useNodeProp(sessionState, (s) => s.title);
  useEffect(() => {
    const display = truncateMiddle(title?.trim() || FALLBACK_TITLE);
    runSetPanelTitle(intents, {
      panelId: chatPanelId(sessionId),
      title: display,
    });
  }, [title, sessionId, intents]);
  return null;
}
