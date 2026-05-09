import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import { FilesManager } from "../internal/files.manager.js";

/**
 * Logic-fragment init for `files`. Constructs the `FilesManager`
 * which:
 *  - Registers `files:*` intent handlers against the workspace's
 *    primary `FilesApi`.
 *  - Contributes a `ToolFactory` to `agent:tools` per workspace
 *    cycle (closes over the current files view) — replaces the
 *    inline file-tools install in `agent-runtime/internal/build-runtime`
 *    that landed in Wave 4.1.
 *
 * Boot order: register AFTER `initAgentRuntime` (the `agent:tools`
 * slot must be observable when this fragment contributes). Per
 * ADR 0002 (logic-only): no React imports.
 */
export default function initFiles(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const workspace = getWorkspace(ctx);

  const [register, cleanup] = newRegistry();
  const manager = new FilesManager({ workspace });
  register(() => manager.close());

  return cleanup;
}
