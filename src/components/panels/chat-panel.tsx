import { useEffect, useRef } from "react";
import { Composer } from "@/components/panels/composer";
import { ProgressBanner } from "@/components/session-tree/progress-banner";
import { SessionView } from "@/components/session-tree/session-view";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useActiveSession } from "@/contexts/active-session-context";
import { useRuntime } from "@/contexts/runtime-context";
import { useSendMessage } from "@/hooks/use-send-message";
import { useInvalidateSessions } from "@/hooks/use-session-list";

export function ChatPanel(): React.ReactElement {
  const { state } = useRuntime();
  const { session, isLoading, error, createNew } = useActiveSession();
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
        <button
          type="button"
          onClick={createNew}
          className="rounded-md border px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
        >
          {isLoading
            ? "Loading session…"
            : error
              ? `Failed to load: ${error}`
              : "Start a new chat"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <ScrollArea className="flex-1">
        <SessionView session={session.state} />
      </ScrollArea>
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
