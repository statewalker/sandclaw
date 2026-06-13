import { ShowDockPanelCommand } from "@statewalker/shell.core";
import {
  DOCK_LAYOUT_STORAGE_KEY,
  restorePanelSpecsFromLayout,
  SpecStore,
} from "@statewalker/render.core";
import { Commands } from "@statewalker/shared-commands";
import { newRegistry } from "@statewalker/shared-registry";
import type { Workspace } from "@statewalker/workspace";
import {
  CHAT_CATALOG_ID,
  chatPanelId,
  chatSpecId,
  makeChatSpec,
} from "../public/catalog.js";
import { OpenChatSessionCommand } from "../public/commands.js";

export interface ChatManagerOptions {
  workspace: Workspace;
}

/**
 * Orchestrator for the chat fragment. Registers the
 * `chat:open-session` command handler and runs layout-restore on
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
  private readonly commands: Commands;
  private readonly store: SpecStore;
  private readonly _register: (cleanup: () => void) => () => void;
  private readonly _cleanup: () => Promise<void>;

  constructor({ workspace }: ChatManagerOptions) {
    [this._register, this._cleanup] = newRegistry();
    this.commands = workspace.requireAdapter(Commands);
    this.store = workspace.requireAdapter(SpecStore);

    // Pre-allocate specs for chat panels saved in the dock layout
    // so the dock host's `fromJSON` finds them ready. Runs BEFORE
    // React mounts the DockView host. Layout source is still
    // localStorage; migrates to SystemFiles in Wave 3.
    restorePanelSpecsFromLayout({
      store: this.store,
      storage: globalThis.localStorage,
      layoutKey: DOCK_LAYOUT_STORAGE_KEY,
      panelIdPrefix: "chat:",
      catalogId: CHAT_CATALOG_ID,
      buildSpec: (sessionId) => makeChatSpec(sessionId),
      buildSpecId: (sessionId) => chatSpecId(sessionId),
    });

    this._register(
      this.commands.listen(OpenChatSessionCommand, (cmd) => {
        const { sessionId } = cmd.payload;
        const specId = chatSpecId(sessionId);
        if (!this.store.get(specId)) {
          this.store.create({
            id: specId,
            catalogId: CHAT_CATALOG_ID,
            spec: makeChatSpec(sessionId),
            meta: { persistent: true },
          });
        }
        this.commands
          .call(ShowDockPanelCommand, {
            panelId: chatPanelId(sessionId),
            specId,
          })
          .promise.then(() => cmd.resolve())
          .catch((error: unknown) => cmd.reject(error));
        return true;
      }),
    );
  }

  async close(): Promise<void> {
    await this._cleanup();
  }
}
