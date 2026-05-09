import { defineRegistry, schema } from "@json-render/react";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace-api";
import { CatalogRegistry } from "../../catalog-registry/index.js";
import {
  CHAT_CATALOG_ID,
  chatCatalog,
  provideTurnBlock,
  STANDARD_TURN_BLOCK_KINDS,
} from "../../chat/index.js";
import { ViewRegistry } from "../../core-views/index.js";
import { ChatRoot } from "../internal/chat-root.js";
import {
  AgentMessageBlock,
  ErrorTurnBlock,
  ToolCallsRunBlock,
  UserMessageBlock,
} from "../internal/turn-block-views.js";

/**
 * Renderer-fragment init for chat-views (per ADR 0002). Three
 * concerns:
 *
 *  1. `chat` catalog binding — `<Renderer>` resolves the chat
 *     panel's `ChatRoot` element.
 *  2. Turn-block components — registers built-in renderers
 *     (UserMessage, AgentMessage, ToolCallsRun, Error) into
 *     `ViewRegistry` under `STANDARD_TURN_BLOCK_KINDS.*` viewKeys,
 *     and contributes matching `{kind, viewKey}` entries to the
 *     `chat:turn-blocks` slot. `TurnView` consumes both — there is
 *     no built-in dispatch; plug-in fragments register the same
 *     way.
 *
 * Boot order: register AFTER `initChat` (logic). The composer
 * actions slot is contributed to by other logic fragments
 * (e.g. `providers/`) — `chat-views` does not contribute composer
 * actions itself.
 */
export default function initChatViews(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const catalogs = workspace.requireAdapter(CatalogRegistry);
  const views = workspace.requireAdapter(ViewRegistry);
  const slots = workspace.requireAdapter(Slots);

  // ── Chat catalog (json-render binding) ──────────────────────
  const { registry: chatRegistry } = defineRegistry(chatCatalog, {
    components: {
      ChatRoot: ({ props }) => <ChatRoot sessionId={props.sessionId} />,
    },
    actions: {},
  });
  register(catalogs.register(CHAT_CATALOG_ID, chatRegistry));
  // `schema` import keeps json-render happy in case the catalog file
  // is tree-shaken out elsewhere; the registry built above already
  // pinned it.
  void schema;

  // ── Turn-block components ───────────────────────────────────
  const turnBlocks = [
    {
      kind: STANDARD_TURN_BLOCK_KINDS.USER_MESSAGE,
      component: UserMessageBlock,
    },
    {
      kind: STANDARD_TURN_BLOCK_KINDS.AGENT_MESSAGE,
      component: AgentMessageBlock,
    },
    {
      kind: STANDARD_TURN_BLOCK_KINDS.TOOL_CALLS,
      component: ToolCallsRunBlock,
    },
    {
      kind: STANDARD_TURN_BLOCK_KINDS.ERROR,
      component: ErrorTurnBlock,
    },
  ] as const;
  for (const { kind, component } of turnBlocks) {
    register(
      views.register(
        kind,
        component as unknown as Parameters<typeof views.register>[1],
      ),
    );
    register(provideTurnBlock(slots, { kind, viewKey: kind }));
  }

  return cleanup;
}
