import { Intents } from "@statewalker/shared-intents";
import { useEffect, useRef } from "react";
import { runOpenChatSession } from "@/fragments/chat";
import { WorkspaceShellAdapter } from "@/fragments/workspace-bridge";
import {
  useAdapter,
  useAppWorkspace,
} from "@/fragments/workspace-bridge-views";

const SESSION_PARAM = "s";

/**
 * Non-rendering component contributed to `dock:overlays` by chat-views.
 * Reads `window.location.search` once on mount; if `?s=<id>` is present,
 * subscribes to `WorkspaceShellAdapter` and fires
 * `runOpenChatSession({ sessionId })` exactly once when the adapter
 * reaches `ready`. After that single firing, the URL is no longer
 * consulted — tab focus changes do not write the URL back.
 *
 * Replaces the previous router-side `useSearchParams` deep-link path
 * (ADR 0003: no React Router at the app root).
 */
export function DeepLinkMount(): null {
  const workspace = useAppWorkspace();
  const intents = useAdapter(Intents);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get(SESSION_PARAM);
    if (!sessionId) {
      ranRef.current = true;
      return;
    }
    const shell = workspace.requireAdapter(WorkspaceShellAdapter);
    const fire = (): void => {
      if (ranRef.current) return;
      if (shell.getState().status === "ready") {
        ranRef.current = true;
        runOpenChatSession(intents, { sessionId });
      }
    };
    fire();
    if (ranRef.current) return;
    const unsubscribe = shell.onUpdate(() => {
      fire();
      if (ranRef.current) unsubscribe();
    });
    return () => {
      unsubscribe();
    };
  }, [workspace, intents]);

  return null;
}
