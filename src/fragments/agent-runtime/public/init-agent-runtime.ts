import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import { AgentRuntimeManager } from "../internal/agent-runtime.manager.js";
import { ActiveModel } from "./active-model.js";
import { ProvidersBootstrap } from "./providers-bootstrap.js";
import { AgentRuntimeAdapter } from "./runtime-state.js";

const DEFAULT_SYSTEM_FOLDER = ".settings";

/**
 * Logic-fragment init for `agent-runtime`. Constructs:
 *
 *   - `ActiveModel` adapter (the resolved provider+model pointer).
 *   - `AgentRuntimeAdapter` adapter (the unified state machine).
 *   - `ProvidersBootstrap` adapter (interim; replaced by the
 *     `providers/` fragment in Wave 4.2).
 *   - `AgentRuntimeManager` (re-entrant orchestrator).
 *
 * Wires the bootstrap into the workspace lifecycle so providers.json
 * is loaded on `onLoad` and torn down on `onUnload`.
 *
 * Boot order: register AFTER `initWorkspaceBridge` (so workspace
 * lifecycle hooks are wired). Per ADR 0002 (logic-only): no React
 * imports.
 */
export function initAgentRuntime(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const workspace = getWorkspace(ctx);

  workspace.setAdapter(ActiveModel);
  workspace.setAdapter(AgentRuntimeAdapter);
  workspace.setAdapter(ProvidersBootstrap);

  const activeModel = workspace.requireAdapter(ActiveModel);
  const adapter = workspace.requireAdapter(AgentRuntimeAdapter);
  const bootstrap = workspace.requireAdapter(ProvidersBootstrap);
  bootstrap.attach({
    workspace,
    activeModel,
    adapter,
    systemFolder: DEFAULT_SYSTEM_FOLDER,
  });

  const [register, cleanup] = newRegistry();

  // Lifetime-scoped manager — re-entrant on workspace lifecycle.
  const manager = new AgentRuntimeManager({ workspace });
  register(() => manager.close());

  // Per-cycle bootstrap hooks. Bootstrap.notify() flows through the
  // adapter so React consumers re-render.
  register(workspace.onLoad(() => void bootstrap._onLoad()));
  register(workspace.onUnload(() => bootstrap._onUnload()));

  // If the workspace is already open at registration time, fire onLoad
  // now so the bootstrap doesn't sit idle.
  if (workspace.isOpened) void bootstrap._onLoad();

  return cleanup;
}
