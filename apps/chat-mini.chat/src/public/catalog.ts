import { defineCatalog, type Spec } from "@json-render/core";
import { schema } from "@json-render/react";
import { z } from "zod";

/**
 * Catalog declaration for the chat panel — the typed schema only,
 * no React bindings. Per ADR 0002 (logic / renderer split): the
 * `chat` logic fragment publishes this catalog as pure data; the
 * paired `chat-views` renderer fragment binds the React component
 * for `ChatRoot` and registers the resolved entry into
 * `CatalogRegistry`.
 *
 * Single component (`ChatRoot`) whose `sessionId` prop locks the
 * tab to one session. Per design D2 of `chat-mini-session-tabs`,
 * `ChatRoot` reads `sessionId` from spec props (not from URL or
 * shared context) so multiple tabs render different sessions
 * independently.
 */
export const chatCatalog = defineCatalog(schema, {
  components: {
    ChatRoot: { props: z.object({ sessionId: z.string() }) },
  },
  actions: {},
});

export const CHAT_CATALOG_ID = "chat";

/**
 * The one-element chat spec for `sessionId`. `panelId` and `specId`
 * are derived deterministically from the session id so opening the
 * same session from anywhere yields the same tab.
 */
export function makeChatSpec(sessionId: string): Spec {
  return {
    root: "chat",
    elements: {
      chat: {
        type: "ChatRoot",
        props: { sessionId },
        children: [],
      },
    },
  } as Spec;
}

export function chatPanelId(sessionId: string): string {
  return `chat:${sessionId}`;
}

export function chatSpecId(sessionId: string): string {
  return `spec:chat:${sessionId}`;
}
