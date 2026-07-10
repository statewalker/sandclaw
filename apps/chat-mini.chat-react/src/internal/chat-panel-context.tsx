import { createContext, useContext } from "react";

/**
 * Context exposing the active session id for slot-rendered children
 * of the chat composer (e.g. the model picker contributed by
 * `models-config-react`). The picker writes the session's `modelRef`
 * on user selection, so it needs the id of the panel it sits inside.
 *
 * `null` outside any `<ChatPanel>` — slot consumers should defensively
 * handle this case (e.g. render no-op or a "Configure models…" hint).
 */
export interface ChatPanelContextValue {
  sessionId: string;
}

export const ChatPanelContext = createContext<ChatPanelContextValue | null>(
  null,
);

/** Read the active session id for a slot-rendered child of the
 * composer. Returns `null` outside any `<ChatPanel>`. */
export function useChatPanelContext(): ChatPanelContextValue | null {
  return useContext(ChatPanelContext);
}
