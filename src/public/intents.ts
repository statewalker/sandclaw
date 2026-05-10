import { newIntent } from "@statewalker/shared-intents";

export interface OpenChatSessionPayload {
  sessionId: string;
}

/**
 * Opens (or focuses) a per-session chat tab in the dock host. The
 * handler (registered in `init-chat.ts`) ensures
 * `spec:chat:<sessionId>` exists in `SpecStore` and dispatches
 * `dock:show-panel` with the panel id `chat:<sessionId>`.
 * Open-or-focus semantics from `dock:show-panel` make repeat calls
 * safe — the existing tab is focused rather than duplicated.
 */
export const [runOpenChatSession, handleOpenChatSession] = newIntent<
  OpenChatSessionPayload,
  void
>("chat:open-session");
