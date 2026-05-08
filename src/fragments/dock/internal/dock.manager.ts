import { Intents } from "@statewalker/shared-intents";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import type { Workspace } from "@statewalker/workspace-api";
import { SpecStore } from "../../spec-store/index.js";
import { DockHost } from "../public/dock-host.js";
import {
  handleClosePanel,
  handleFocusPanel,
  handleSetPanelTitle,
  handleShowDockPanel,
} from "../public/intents.js";
import { installBusTrace } from "./bus-trace.js";

export interface DockManagerOptions {
  workspace: Workspace;
}

/**
 * Orchestrator for the dock fragment. Owns the four `dock:*` intent
 * handlers and the bus-trace toggle. Constructed once per
 * fragment-init; cleaned up via `close()`.
 *
 * Re-entrant lifecycle (ADR 0001) is added in Wave 3 alongside the
 * SystemFiles-backed layout migration; today the manager is one-shot
 * because the workspace is never `open()`ed in the current codebase.
 */
export class DockManager {
  private readonly intents: Intents;
  private readonly slots: Slots;
  private readonly dockHost: DockHost;
  private readonly store: SpecStore;
  private readonly _register: (cleanup: () => void) => () => void;
  private readonly _cleanup: () => Promise<void>;

  constructor({ workspace }: DockManagerOptions) {
    [this._register, this._cleanup] = newRegistry();
    this.intents = workspace.requireAdapter(Intents);
    this.slots = workspace.requireAdapter(Slots);
    this.dockHost = workspace.requireAdapter(DockHost);
    this.store = workspace.requireAdapter(SpecStore);

    this._wireHandlers();
  }

  private _wireHandlers(): void {
    this._register(installBusTrace(this.intents, this.slots));

    this._register(
      handleShowDockPanel(this.intents, (intent) => {
        this.dockHost
          .showOrFocus(intent.payload)
          .then(() => intent.resolve())
          .catch((error) => intent.reject(error));
        return true;
      }),
    );

    this._register(
      handleClosePanel(this.intents, (intent) => {
        const { panelId } = intent.payload;
        const api = this.dockHost._getApi();
        const panel = api?.getPanel(panelId);
        const specId = (panel?.params as { specId?: string } | undefined)
          ?.specId;
        this.dockHost.closePanel(panelId);
        if (specId) {
          const record = this.store.get(specId);
          const stillReferenced =
            api?.panels.some(
              (p) =>
                p.id !== panelId &&
                (p.params as { specId?: string })?.specId === specId,
            ) ?? false;
          if (record && record.meta.persistent !== true && !stillReferenced) {
            this.store.delete(specId);
          }
        }
        intent.resolve();
        return true;
      }),
    );

    this._register(
      handleFocusPanel(this.intents, (intent) => {
        this.dockHost.focusPanel(intent.payload.panelId);
        intent.resolve();
        return true;
      }),
    );

    this._register(
      handleSetPanelTitle(this.intents, (intent) => {
        this.dockHost.setPanelTitle(
          intent.payload.panelId,
          intent.payload.title,
        );
        intent.resolve();
        return true;
      }),
    );

    this._register(() => this.dockHost.detach());
  }

  async close(): Promise<void> {
    await this._cleanup();
  }
}
