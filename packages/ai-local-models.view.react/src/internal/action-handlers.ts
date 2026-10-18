import type { StateStore } from "@json-render/core";
import { LocalModels, SelectLocalModelCommand } from "@statewalker/ai-local-models.core";
import { Commands } from "@statewalker/shared-commands";
import type { Workspace } from "@statewalker/workspace.core";

type Handler = (params: Record<string, unknown>) => Promise<void>;

export interface ActionHandlerContext {
  workspace: Workspace;
  store: StateStore;
}

/**
 * Build the local-models action-handler map. Closures capture the
 * workspace + store; downloads stream progress into `/ui/downloads/<key>`,
 * and completion / removal flows through the `LocalModels` adapter, which
 * owns the persisted downloaded set. Selection is dispatched through
 * `SelectLocalModelCommand` (handled by the logic fragment).
 */
export function buildLocalActionHandlers(ctx: ActionHandlerContext): Record<string, Handler> {
  const { workspace, store } = ctx;
  const localModels = workspace.requireAdapter(LocalModels);
  const commands = workspace.requireAdapter(Commands);

  const setUi = (path: string, value: unknown): void => store.set(`/ui/${path}`, value);

  async function downloadLocalModel(params: Record<string, unknown>): Promise<void> {
    const { key } = params as { key: string };
    try {
      for await (const progress of localModels.download(key)) {
        setUi(`downloads/${key}`, {
          phase: progress.phase,
          progress: progress.progress ?? 0,
          message: progress.message,
        });
      }
      await localModels.markDownloaded(key);
    } catch (err) {
      setUi(`downloads/${key}/error`, err instanceof Error ? err.message : String(err));
    }
  }

  async function cancelDownload(params: Record<string, unknown>): Promise<void> {
    const { key } = params as { key: string };
    localModels.cancelDownload(key);
    setUi(`downloads/${key}`, undefined);
  }

  async function removeLocalModel(params: Record<string, unknown>): Promise<void> {
    const { key } = params as { key: string };
    await localModels.removeWeights(key);
  }

  async function selectLocalModel(params: Record<string, unknown>): Promise<void> {
    const { key } = params as { key: string };
    await commands.call(SelectLocalModelCommand, { modelId: key }).promise;
  }

  return { downloadLocalModel, cancelDownload, removeLocalModel, selectLocalModel };
}
