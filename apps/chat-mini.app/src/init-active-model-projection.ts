import { ActiveModel, AgentRuntimeAdapter } from "@statewalker/ai-agent-runtime.core";
import { AiConfig } from "@statewalker/ai-config.core";
import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace.core";

/**
 * Project `AiConfig`'s active **remote** selection into `ActiveModel` (the chat
 * runtime's build pointer). Pre-resolves the provider because
 * `ActiveModelValue.createProvider` is synchronous while `AiConfig.getProvider`
 * reads the key from `Secrets` (async). Local selections are owned by the
 * local-model path and ignored here. Idempotent and safe to call on every
 * `AiConfig` update and on workspace load.
 */
export async function applyRemoteActive(aiConfig: AiConfig, activeModel: ActiveModel): Promise<void> {
  const active = aiConfig.getActive();
  if (!active.connectionId || !active.modelId || active.connectionId === "local") return;
  const current = activeModel.get();
  if (
    current?.kind === "remote" &&
    current.providerId === active.connectionId &&
    current.modelId === active.modelId
  ) {
    return;
  }
  try {
    const provider = await aiConfig.getProvider(active.connectionId);
    // Re-read in case the active selection changed while awaiting.
    const latest = aiConfig.getActive();
    if (latest.connectionId !== active.connectionId || latest.modelId !== active.modelId) return;
    activeModel.set({
      kind: "remote",
      providerId: active.connectionId,
      modelId: active.modelId,
      createProvider: () => provider,
    });
  } catch {
    // Bad/missing key or unbuildable provider — leave ActiveModel untouched.
  }
}

/**
 * Single owner of the chat runtime's **empty-state** (`AgentRuntimeAdapter`
 * `no-providers` / `no-active-model`). When a model is active (remote or local)
 * the `AgentRuntimeManager` owns the published state (`ready` / `error`), so
 * this is a no-op. When nothing is active it sets `no-providers` (no AiConfig
 * connections) or `no-active-model` (connections exist but none selected) so the
 * chat UI shows its placeholder instead of hanging on the `loading` spinner.
 */
export function applyRuntimeEmptyState(
  aiConfig: AiConfig,
  activeModel: ActiveModel,
  adapter: AgentRuntimeAdapter,
): void {
  if (activeModel.get()) return;
  const hasConnections = aiConfig.listConnections().length > 0;
  adapter._setState({ status: hasConnections ? "no-active-model" : "no-providers" });
}

/**
 * Chat-app composition glue: wire `AiConfig` (the source of truth) into the chat
 * agent runtime. Lives in the app boot — only chat projects config → runtime
 * (wiki has no agent runtime), so neither `ai-config.core` nor
 * `ai-agent-runtime.core` should depend on the other for this.
 *
 * - Remote projection runs on every `AiConfig` update and on workspace load.
 * - The runtime empty-state is recomputed reactively on every `ActiveModel`
 *   change (covers both remote and local selections, including clears) and on
 *   `AiConfig` changes (e.g. the last connection removed while none selected).
 *
 * Boot order: AFTER `initAgentRuntime` (`ActiveModel` + `AgentRuntimeAdapter`)
 * and `initAiConfig` (`AiConfig`).
 */
export default function initActiveModelProjection(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const aiConfig = workspace.requireAdapter(AiConfig);
  const activeModel = workspace.requireAdapter(ActiveModel);
  const adapter = workspace.requireAdapter(AgentRuntimeAdapter);

  const [register, cleanup] = newRegistry();

  const projectRemote = (): void => {
    void applyRemoteActive(aiConfig, activeModel).then(() =>
      applyRuntimeEmptyState(aiConfig, activeModel, adapter),
    );
  };
  const refreshEmptyState = (): void => applyRuntimeEmptyState(aiConfig, activeModel, adapter);

  register(aiConfig.onUpdate(projectRemote));
  register(workspace.onLoad(projectRemote));
  // Reactive empty-state: covers local selections/clears (which only set
  // `ActiveModel`) and connection removals.
  register(activeModel.onUpdate(refreshEmptyState));

  return cleanup;
}
