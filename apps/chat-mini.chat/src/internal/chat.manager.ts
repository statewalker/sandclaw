import { ShowDockPanelCommand } from "@statewalker/shell.core";
import {
  LayoutStore,
  restorePanelSpecsFromLayout,
  SpecStore,
} from "@statewalker/render.core";
import { Commands } from "@statewalker/shared-commands";
import { newRegistry } from "@statewalker/shared-registry";
import type { Workspace } from "@statewalker/workspace.core";
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
 * `chat:open-session` command handler and pre-allocates chat panel
 * specs from the saved dock layout on workspace-connect. Per ADR 0002
 * (logic-only fragment): no React imports.
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
    const layoutStore = workspace.requireAdapter(LayoutStore);

    // Pre-allocate specs for chat panels saved in the dock layout so
    // the dock host's deferred `fromJSON` finds them ready. Runs on
    // workspace-connect (`onLoad`), reading the layout held by the
    // `LayoutStore` adapter — after it has loaded the file, before
    // `DockHost` applies the layout.
    this._register(
      workspace.onLoad(() => {
        restorePanelSpecsFromLayout({
          store: this.store,
          layout: layoutStore.get(),
          panelIdPrefix: "chat:",
          catalogId: CHAT_CATALOG_ID,
          buildSpec: (sessionId) => makeChatSpec(sessionId),
          buildSpecId: (sessionId) => chatSpecId(sessionId),
        });
      }),
    );

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
