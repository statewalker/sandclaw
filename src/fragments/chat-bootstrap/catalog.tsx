import { defineCatalog, type Spec } from "@json-render/core";
import { defineRegistry, schema } from "@json-render/react";
import { z } from "zod";
import { ChatRoot } from "./chat-root.js";

/**
 * Catalog for the chat panel. Single component (`ChatRoot`) with no
 * props — `ChatRoot` reads its state from React context
 * (`useActiveSession()` + `useRuntime()`) rather than spec props,
 * so the spec is degenerate.
 *
 * Per design.md D6, the chat panel is a single-element opaque
 * mount: the spec carries one `ChatRoot` element, the renderer
 * mounts it, and `ChatRoot` takes over with imperative React.
 */
const chatCatalog = defineCatalog(schema, {
  components: {
    ChatRoot: { props: z.object({}) },
  },
  actions: {},
});

const { registry: chatRegistry } = defineRegistry(chatCatalog, {
  components: {
    ChatRoot: () => <ChatRoot />,
  },
  actions: {},
});

export const CHAT_CATALOG_ID = "chat";

export const CHAT_CATALOG_ENTRY = {
  catalog: chatCatalog,
  components: { ChatRoot },
  registry: chatRegistry,
};

/**
 * The one-element chat spec. `panelId` and `specId` are derived
 * deterministically from the active session id (per vision §3.6
 * "What this means for the layout / panel id"), so opening a
 * session from anywhere yields the same panel.
 */
export function makeChatSpec(): Spec {
  return {
    root: "chat",
    elements: {
      chat: {
        type: "ChatRoot",
        props: {},
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
