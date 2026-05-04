import type { LocalModelConfig } from "@statewalker/ai-agent/models";
import { ChevronDown } from "lucide-react";
import { LocalModelRow } from "@/components/local-models/local-model-row";
import { useActivateLocal } from "@/components/local-models/use-activate-local";
import { useModelStatuses } from "@/components/local-models/use-model-status";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useRuntime } from "@/contexts/runtime-context";
import { webGpuAvailable } from "@/services/local-models/engine-detection";

interface LocalModelsTabProps {
  /** Persist the active selection (called on `ready`). */
  onActivated?: (catalogKey: string) => void | Promise<void>;
}

function isFeatured(config: LocalModelConfig): boolean {
  return config.family.toLowerCase().includes("gemma");
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

  const featured = localEntries.filter(([, c]) => isFeatured(c));
  const others = localEntries.filter(([, c]) => !isFeatured(c));

  const handleActivate = async (key: string): Promise<void> => {
    const ok = await doActivate(key);
    if (ok) await onActivated?.(key);
  };

  const handleDelete = async (key: string): Promise<void> => {
    await manager.deleteLocal(key);
  };

  const renderRow = ([key, config]: [string, LocalModelConfig]) => {
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
  };

  if (localEntries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No local models in the catalog.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {featured.length > 0 ? (
        <div className="flex flex-col gap-3">{featured.map(renderRow)}</div>
      ) : null}

      {others.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">
            <span>Other models ({others.length})</span>
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-3 pt-3">
            {others.map(renderRow)}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
