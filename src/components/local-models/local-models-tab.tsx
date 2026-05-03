import type { LocalModelConfig } from "@statewalker/ai-agent/models";
import { LocalModelRow } from "@/components/local-models/local-model-row";
import { useActivateLocal } from "@/components/local-models/use-activate-local";
import { useModelStatuses } from "@/components/local-models/use-model-status";
import { useRuntime } from "@/contexts/runtime-context";
import { webGpuAvailable } from "@/services/local-models/engine-detection";

interface LocalModelsTabProps {
  /** Persist the active selection (called on `ready`). */
  onActivated?: (catalogKey: string) => void | Promise<void>;
}

export function LocalModelsTab({
  onActivated,
}: LocalModelsTabProps): React.ReactElement {
  const { manager, state } = useRuntime();
  const statuses = useModelStatuses(manager);
  const {
    state: activate,
    activate: doActivate,
    cancel,
  } = useActivateLocal(manager);

  if (!webGpuAvailable()) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">WebGPU is not available</p>
        <p>
          Local models run in your browser via WebGPU. Use a recent version of
          Chrome, Edge, or Arc on a device with a compatible GPU.
        </p>
      </div>
    );
  }

  const activeKey =
    state.status === "ready" && state.activeProviderId === "local"
      ? state.activeModelId
      : null;

  const localEntries = Object.entries(manager.store.catalog).filter(
    ([, c]) => c.runtime === "local",
  ) as Array<[string, LocalModelConfig]>;

  const handleActivate = async (key: string): Promise<void> => {
    const ok = await doActivate(key);
    if (ok) await onActivated?.(key);
  };

  const handleDelete = async (key: string): Promise<void> => {
    await manager.deleteLocal(key);
  };

  return (
    <div className="flex flex-col gap-3">
      {localEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No local models in the catalog.
        </p>
      ) : (
        localEntries.map(([key, config]) => {
          const status = statuses.get(key)?.status ?? "not-downloaded";
          const error = statuses.get(key)?.error;
          const isActivatingThis = activate.activatingKey === key;
          return (
            <LocalModelRow
              key={key}
              catalogKey={key}
              config={config}
              status={status}
              error={isActivatingThis ? (activate.error ?? error) : error}
              activatingProgress={isActivatingThis ? activate.progress : null}
              isActive={activeKey === key}
              onActivate={handleActivate}
              onCancel={cancel}
              onDelete={handleDelete}
            />
          );
        })
      )}
    </div>
  );
}
