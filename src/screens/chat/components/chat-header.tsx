import type { Session } from "@statewalker/ai-agent/state";
import type { ReactElement } from "react";
import { useNodeProp } from "@/screens/chat/hooks/use-session-node";

/**
 * Header strip for the chat container. Shows the active session
 * title centered in the same `max-w-[768px]` column the message
 * list and composer use, so the whole chat surface lines up
 * vertically. Subscribes to `session.title` so renames reflect
 * live without a remount.
 */
export function ChatHeader({ session }: { session: Session }): ReactElement {
  const title = useNodeProp(session, (s) => s.title) ?? "Untitled session";
  return (
    <div className="flex h-12 shrink-0 items-center border-b border-border bg-background">
      <div className="mx-auto w-full max-w-[768px] truncate px-5 text-sm font-medium">
        {title}
      </div>
    </div>
  );
}
