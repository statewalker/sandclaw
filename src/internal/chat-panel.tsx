import type { ChatSessionState } from "@repo/chat-mini.chat-react";
import { AgentRuntimeAdapter } from "@statewalker/ai-agent-runtime";
import { useAdapterValue } from "@statewalker/core-react";
import { useEffect, useMemo, useRef } from "react";
import { ChatHeader } from "./chat-header";
import {
  ChatPanelContext,
  type ChatPanelContextValue,
} from "./chat-panel-context.js";
import { Composer } from "./composer";
import { useSendMessage } from "./hooks/use-send-message.js";
import { useInvalidateSessions } from "./hooks/use-session-list.js";
import { ProgressBanner } from "./progress-banner";
import {
  ChatContainerContent,
  ChatContainerRoot,
} from "./prompt-kit/chat-container.js";
import { ScrollButton } from "./prompt-kit/scroll-button.js";
import { SessionView } from "./session-view";

export interface ChatPanelProps {
  chatSession: ChatSessionState;
}

export function ChatPanel({ chatSession }: ChatPanelProps): React.ReactElement {
  const state = useAdapterValue(AgentRuntimeAdapter, (a) => a.getState());
  const { session, isLoading, error } = chatSession;
  const { send, abort, progress } = useSendMessage(session);
  const invalidate = useInvalidateSessions();

  // Refresh the sidebar list each time a turn finishes so titles /
  // updatedAt reflect what's on disk.
  const lastRunningRef = useRef(false);
  useEffect(() => {
    if (lastRunningRef.current && !progress.running) {
      invalidate();
    }
    lastRunningRef.current = progress.running;
  }, [progress.running, invalidate]);

  const sessionId = session?.id;
  const ctx = useMemo<ChatPanelContextValue | null>(
    () => (sessionId ? { sessionId } : null),
    [sessionId],
  );

  if (state.status !== "ready") return <div />;

  if (!session) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <p className="rounded-md border px-4 py-2 text-sm text-muted-foreground">
          {isLoading
            ? "Loading session…"
            : error
              ? `Failed to load: ${error}`
              : "Session not found."}
        </p>
      </div>
    );
  }

  return (
    <ChatPanelContext.Provider value={ctx}>
      <div className="flex h-full w-full flex-col bg-background">
        <ChatHeader session={session.state} />
        <ChatContainerRoot className="relative flex-1">
          <ChatContainerContent className="mx-auto w-full max-w-[768px] px-5 py-4">
            <SessionView session={session.state} />
          </ChatContainerContent>
          <div className="pointer-events-none absolute right-4 bottom-4 z-10 flex items-end justify-end">
            <div className="pointer-events-auto">
              <ScrollButton />
            </div>
          </div>
        </ChatContainerRoot>
        <ProgressBanner progress={progress} />
        <Composer
          onSend={send}
          onStop={abort}
          running={progress.running}
          disabled={false}
        />
      </div>
    </ChatPanelContext.Provider>
  );
}
