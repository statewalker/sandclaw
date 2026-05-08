import { useEffect, useRef } from "react";
import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/prompt-kit/chat-container";
import { ScrollButton } from "@/components/prompt-kit/scroll-button";
import { AgentRuntimeAdapter } from "@/fragments/agent-runtime";
import type { ChatSessionState } from "@/fragments/chat-views";
import { useAdapterValue } from "@/lib/use-adapter-value";
import { useSendMessage } from "@/screens/chat/hooks/use-send-message";
import { useInvalidateSessions } from "@/screens/chat/hooks/use-session-list";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { ProgressBanner } from "./progress-banner";
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
  );
}
