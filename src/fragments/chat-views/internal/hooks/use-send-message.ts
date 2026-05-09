import type { Session } from "@statewalker/ai-agent/runtime";
import { useCallback, useRef, useState } from "react";

export interface SendProgress {
  running: boolean;
  currentTool: string | null;
  lastError: string | null;
}

const IDLE_PROGRESS: SendProgress = {
  running: false,
  currentTool: null,
  lastError: null,
};

export interface UseSendMessageResult {
  send: (text: string) => Promise<void>;
  abort: () => void;
  progress: SendProgress;
}

/**
 * Drive a session's `run()` for transient progress UI. The reactive
 * `Session` tree is the source of truth for the conversation; this hook
 * only tracks running state, the active tool, and the last error
 * observed. Auto-saves on each `turn-finish`.
 */
export function useSendMessage(
  session: Session | undefined,
): UseSendMessageResult {
  const ctrlRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<SendProgress>(IDLE_PROGRESS);

  const send = useCallback(
    async (text: string): Promise<void> => {
      if (!session) return;
      if (ctrlRef.current) return; // already running
      const trimmed = text.trim();
      if (!trimmed) return;

      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setProgress({ running: true, currentTool: null, lastError: null });

      session.send(trimmed);
      try {
        for await (const log of session.run(ctrl.signal)) {
          switch (log.type) {
            case "tool-call":
              setProgress((p) => ({ ...p, currentTool: log.toolName }));
              break;
            case "tool-result":
            case "tool-error":
              setProgress((p) => ({ ...p, currentTool: null }));
              break;
            case "turn-finish":
              await session.save();
              // The controller's run() waits on the inbox for the next user
              // turn — without an explicit abort, the for-await loop hangs
              // here forever. Aborting terminates the iterator cleanly so we
              // can flip `running` back to false and let callers like the
              // sidebar invalidation effect fire. (Same pattern as
              // ai-chat-cli/src/cli-application.ts.)
              ctrl.abort();
              break;
            case "error":
              setProgress((p) => ({ ...p, lastError: log.message }));
              break;
            default:
              break;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // AbortError is expected when the user clicks Stop; don't surface it.
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setProgress((p) => ({ ...p, lastError: message }));
        }
      } finally {
        ctrlRef.current = null;
        setProgress((p) => ({ ...p, running: false, currentTool: null }));
      }
    },
    [session],
  );

  const abort = useCallback(() => {
    ctrlRef.current?.abort();
  }, []);

  return { send, abort, progress };
}
