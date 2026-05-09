import { getWorkspace } from "@statewalker/workspace-api";
import { WorkspaceBridgeManager } from "../internal/workspace-bridge.manager.js";

/**
 * Logic-fragment init for workspace-bridge. Registers the
 * `workspace:change` handler from `@statewalker/workspace-api`,
 * which performs the canonical close → setFileSystem → open
 * cycle on each switch.
 *
 * Boot order: register AFTER `initPlatformWeb` so the
 * `platform:pick-directory` handler is already in place (the
 * change-workspace handler delegates to it for the interactive
 * path).
 */
export default function initWorkspaceBridge(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const manager = new WorkspaceBridgeManager({ workspace });
  return () => manager.close();
}
