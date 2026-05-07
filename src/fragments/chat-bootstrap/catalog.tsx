import { defineCatalog, type Spec } from "@json-render/core";
import { defineRegistry, schema } from "@json-render/react";
import type { ComponentType } from "react";
import { z } from "zod";
import { ChatRoot } from "./chat-root.js";

/**
 * Catalog for the chat panel. Single component (`ChatRoot`) whose
 * `sessionId` prop locks the tab to one session. Per design D2 of
 * `chat-mini-session-tabs`, `ChatRoot` reads `sessionId` from spec
 * props (not from URL or shared context) so multiple tabs render
 * different sessions independently.
 */
const chatCatalog = defineCatalog(schema, {
  components: {
    ChatRoot: { props: z.object({ sessionId: z.string() }) },
  },
  actions: {},
});

const { registry: chatRegistry } = defineRegistry(chatCatalog, {
  components: {
    ChatRoot: ({ props }) => <ChatRoot sessionId={props.sessionId} />,
  },
  actions: {},
});

export const CHAT_CATALOG_ID = "chat";

export const CHAT_CATALOG_ENTRY = {
  catalog: chatCatalog,
  // CatalogEntry expects `Record<string, ComponentType<unknown>>`;
  // ChatRoot takes a required `sessionId` prop, which is narrower
  // than ComponentType<unknown>. The map is held opaquely by
  // CatalogRegistry — `<Renderer>` consumes `registry`, not this
  // map — so the cast is safe.
  components: { ChatRoot } as Record<string, ComponentType<unknown>>,
  registry: chatRegistry,
};

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
