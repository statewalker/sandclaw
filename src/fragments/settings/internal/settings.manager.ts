import { Intents } from "@statewalker/shared-intents";
import { newRegistry } from "@statewalker/shared-registry";
import type { Workspace } from "@statewalker/workspace-api";
import { handleCloseSettings, handleOpenSettings } from "../public/intents.js";
import { Settings } from "../public/settings.adapter.js";

export interface SettingsManagerOptions {
  workspace: Workspace;
}

/**
 * Lifetime-scoped orchestrator for the settings fragment.
 * Registers default handlers for `runOpenSettings` /
 * `runCloseSettings`; both write to the `Settings` adapter so
 * React consumers re-render via `useSyncExternalStore` on
 * `BaseClass.onUpdate`.
 *
 * The dialog state is local UI — it does not depend on workspace
 * lifecycle, so this manager is one-shot (constructed at boot,
 * survives `onLoad`/`onUnload` cycles). Slot contributions to
 * `settings:tabs` arrive from other fragments' lifecycle managers
 * and are observed directly by the renderer fragment.
 */
export class SettingsManager {
  private readonly _cleanup: () => Promise<void>;

  constructor({ workspace }: SettingsManagerOptions) {
    const intents = workspace.requireAdapter(Intents);
    const settings = workspace.requireAdapter(Settings);

    const [register, cleanup] = newRegistry();
    this._cleanup = cleanup;

    register(
      handleOpenSettings(intents, (intent) => {
        settings._setOpen(true, intent.payload?.tabId);
        intent.resolve();
        return true;
      }),
    );
    register(
      handleCloseSettings(intents, (intent) => {
        settings._setOpen(false);
        intent.resolve();
        return true;
      }),
    );
  }

  async close(): Promise<void> {
    await this._cleanup();
  }
}
