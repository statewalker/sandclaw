import { defineRegistry, schema } from "@json-render/react";
import {
  CHAT_CATALOG_ID,
  chatCatalog,
  STANDARD_TURN_BLOCK_KINDS,
  turnBlocksSlot,
} from "@repo/chat-mini.chat";
import { coreViewsSlot, type ViewComponent } from "@statewalker/core-react";
import { dockOverlaysSlot, dockSidePanelsSlot } from "@statewalker/shell.core";
import { catalogsSlot } from "@statewalker/render.core";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace";
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
  const slots = workspace.requireAdapter(Slots);

  // ── Chat catalog (json-render binding) ──────────────────────
  const { registry: chatRegistry } = defineRegistry(chatCatalog, {
    components: {
      ChatRoot: ({ props }) => <ChatRoot sessionId={props.sessionId} />,
    },
    actions: {},
  });
  register(slots.register(catalogsSlot, CHAT_CATALOG_ID, chatRegistry));
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
      slots.register(
        coreViewsSlot,
        kind,
        component as unknown as ViewComponent,
      ),
    );
    register(slots.provide(turnBlocksSlot, { kind, viewKey: kind }));
  }

  // ── Sessions panel (dock side panel) ────────────────────────
  register(
    slots.register(
      coreViewsSlot,
      SESSIONS_PANEL_VIEW_KEY,
      SessionsPanel as unknown as ViewComponent,
    ),
  );
  register(
    slots.provide(dockSidePanelsSlot, {
      id: "chat:sessions",
      side: "left",
      viewKey: SESSIONS_PANEL_VIEW_KEY,
      defaultSize: 280,
    }),
  );

  // ── Deep-link mount (dock overlay; renders nothing) ─────────
  register(
    slots.register(
      coreViewsSlot,
      DEEP_LINK_VIEW_KEY,
      DeepLinkMount as unknown as ViewComponent,
    ),
  );
  register(
    slots.provide(dockOverlaysSlot, {
      id: "chat:deep-link",
      viewKey: DEEP_LINK_VIEW_KEY,
    }),
  );

  return cleanup;
}
