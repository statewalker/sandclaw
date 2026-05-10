import { defineRegistry, schema } from "@json-render/react";
import {
  CHAT_CATALOG_ID,
  chatCatalog,
  provideTurnBlock,
  STANDARD_TURN_BLOCK_KINDS,
} from "@repo/chat-mini.chat";
import { newViewRegistry } from "@statewalker/core-react";
import { provideDockOverlay, provideDockSidePanel } from "@statewalker/dock";
import { newCatalogRegistry } from "@statewalker/json-render";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace-api";
import { ChatRoot } from "../internal/chat-root.js";
import { DeepLinkMount } from "../internal/deep-link-mount.js";
import { SessionsPanel } from "../internal/sessions-panel.js";
import {
  AgentMessageBlock,
  ErrorTurnBlock,
  ToolCallsRunBlock,
  UserMessageBlock,
} from "../internal/turn-block-views.js";

const SESSIONS_PANEL_VIEW_KEY = "chat:sessions-panel";
const DEEP_LINK_VIEW_KEY = "chat:deep-link";

/**
 * Renderer-fragment init for chat-views (per ADR 0002). Concerns:
 *
 *  1. `chat` catalog binding — `<Renderer>` resolves the chat panel's
 *     `ChatRoot` element.
 *  2. Turn-block components — registers built-in renderers into
 *     `ViewRegistry` and contributes matching `{kind, viewKey}` entries
 *     to the `chat:turn-blocks` slot.
 *  3. Sessions panel — registers `SessionsPanel` and contributes a
 *     `dock:side-panels` entry on the left at 280px default size.
 *  4. Deep-link mount — registers `DeepLinkMount` and contributes a
 *     `dock:overlays` entry; the component fires `chat:open-session`
 *     once after `WorkspaceShellAdapter` reaches `ready`.
 */
export default function initChatViews(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const catalogs = newCatalogRegistry(workspace);
  const views = newViewRegistry(workspace);
  const slots = workspace.requireAdapter(Slots);

  // ── Chat catalog (json-render binding) ──────────────────────
  const { registry: chatRegistry } = defineRegistry(chatCatalog, {
    components: {
      ChatRoot: ({ props }) => <ChatRoot sessionId={props.sessionId} />,
    },
    actions: {},
  });
  register(catalogs.register(CHAT_CATALOG_ID, chatRegistry));
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

  // ── Sessions panel (dock side panel) ────────────────────────
  register(
    views.register(
      SESSIONS_PANEL_VIEW_KEY,
      SessionsPanel as unknown as Parameters<typeof views.register>[1],
    ),
  );
  register(
    provideDockSidePanel(slots, {
      id: "chat:sessions",
      side: "left",
      viewKey: SESSIONS_PANEL_VIEW_KEY,
      defaultSize: 280,
    }),
  );

  // ── Deep-link mount (dock overlay; renders nothing) ─────────
  register(
    views.register(
      DEEP_LINK_VIEW_KEY,
      DeepLinkMount as unknown as Parameters<typeof views.register>[1],
    ),
  );
  register(
    provideDockOverlay(slots, {
      id: "chat:deep-link",
      viewKey: DEEP_LINK_VIEW_KEY,
    }),
  );

  return cleanup;
}
