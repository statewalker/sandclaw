import { Intents } from "@statewalker/shared-intents";
import { newRegistry } from "@statewalker/shared-registry";
import type { Workspace } from "@statewalker/workspace-api";
import { registerChangeWorkspaceHandler } from "@statewalker/workspace-api";

export interface WorkspaceBridgeManagerOptions {
  workspace: Workspace;
}

/**
 * Orchestrator for the workspace-bridge fragment. Registers the
 * `workspace:change` handler from `@statewalker/workspace-api` —
 * that handler's contract: close the workspace, rebind the
 * `FilesApi`, re-open. Both interactive (via
 * `platform:pick-directory`) and non-interactive
 * (caller-supplied `files`) paths are covered by the same handler.
 *
 * The manager itself is one-shot today (constructed once at boot;
 * no per-cycle teardown). When the chat-mini React UI is migrated
 * to fire `runChangeWorkspace` on user action (Wave 3.3), the
 * existing localStorage handle-restore flow in
 * `contexts/workspace-context.tsx` collapses into this fragment.
 */
export class WorkspaceBridgeManager {
  private readonly _cleanup: () => Promise<void>;

  constructor({ workspace }: WorkspaceBridgeManagerOptions) {
    const [register, cleanup] = newRegistry();
    this._cleanup = cleanup;
    const intents = workspace.requireAdapter(Intents);
    register(registerChangeWorkspaceHandler({ intents, workspace }));
  }

  async close(): Promise<void> {
    await this._cleanup();
  }
}
