import { OpenChatSessionCommand } from "@statewalker/chat-mini.chat";
import { useAdapter, useAppWorkspace } from "@statewalker/ui.view.react";
import { Commands } from "@statewalker/shared-commands";
import { WorkspaceShellAdapter } from "@statewalker/workspace.browser";
import { useEffect, useRef } from "react";

const SESSION_PARAM = "s";

/**
 * Non-rendering component contributed to `dock:overlays` by chat-views.
 * Reads `window.location.search` once on mount; if `?s=<id>` is present,
 * subscribes to `WorkspaceShellAdapter` and fires
 * `commands.call(OpenChatSessionCommand, { sessionId })` exactly once
 * when the adapter reaches `ready`. After that single firing, the URL
 * is no longer consulted — tab focus changes do not write the URL back.
 *
 * Replaces the previous router-side `useSearchParams` deep-link path
 * (ADR 0003: no React Router at the app root).
 */
export function DeepLinkMount(): null {
  const workspace = useAppWorkspace();
  const commands = useAdapter(Commands);
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
        commands.call(OpenChatSessionCommand, { sessionId });
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
  }, [workspace, commands]);

  return null;
}
