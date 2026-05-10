import { Intents } from "@statewalker/shared-intents";
import { newRegistry } from "@statewalker/shared-registry";
import type { Workspace } from "@statewalker/workspace-api";
import { runShowDockPanel } from "@statewalker/dock";
import { SpecStore } from "@statewalker/json-render";
import {
  CHAT_CATALOG_ID,
  chatPanelId,
  chatSpecId,
  makeChatSpec,
} from "../public/catalog.js";
import { handleOpenChatSession } from "../public/intents.js";
import { restoreChatSpecsFromLayout } from "./layout-restore.js";

const LAYOUT_KEY = "chat-mini:dock-layout";

export interface ChatManagerOptions {
  workspace: Workspace;
}

/**
 * Orchestrator for the chat fragment. Registers the
 * `chat:open-session` intent handler and runs layout-restore on
 * construction. Per ADR 0002 (logic-only fragment): no React
 * imports.
 *
 * Re-entrant lifecycle (ADR 0001) is added in Wave 3 alongside the
 * SystemFiles-backed layout migration; today the manager is one-shot
 * because the workspace is never `open()`ed in the current codebase.
 *
 * Boot order: this fragment registers AFTER `initSpecStore` and
 * AFTER `initDock`. Catalog registration (the React binding) lives
 * in the paired `chat-views` renderer fragment, which registers
 * after this one.
 */
export class ChatManager {
  private readonly intents: Intents;
  private readonly store: SpecStore;
  private readonly _register: (cleanup: () => void) => () => void;
  private readonly _cleanup: () => Promise<void>;

  constructor({ workspace }: ChatManagerOptions) {
    [this._register, this._cleanup] = newRegistry();
    this.intents = workspace.requireAdapter(Intents);
    this.store = workspace.requireAdapter(SpecStore);

    // Pre-allocate specs for chat panels saved in the dock layout
    // so the dock host's `fromJSON` finds them ready. Runs BEFORE
    // React mounts the DockView host. Layout source is still
    // localStorage; migrates to SystemFiles in Wave 3.
    restoreChatSpecsFromLayout(this.store, globalThis.localStorage, LAYOUT_KEY);

    this._register(
      handleOpenChatSession(this.intents, (intent) => {
        const { sessionId } = intent.payload;
        const specId = chatSpecId(sessionId);
        if (!this.store.get(specId)) {
          this.store.create({
            id: specId,
            catalogId: CHAT_CATALOG_ID,
            spec: makeChatSpec(sessionId),
            meta: { persistent: true },
          });
        }
        runShowDockPanel(this.intents, {
          panelId: chatPanelId(sessionId),
          specId,
        })
          .promise.then(() => intent.resolve())
          .catch((error: unknown) => intent.reject(error));
        return true;
      }),
    );
  }

  async close(): Promise<void> {
    await this._cleanup();
  }
}
