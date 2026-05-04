import {
  createDefaultCatalog,
  type LocalModelConfig,
  type ModelConfig,
} from "@statewalker/ai-agent/models";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useActivateLocal } from "@/components/local-models/use-activate-local";
import { useModelStatuses } from "@/components/local-models/use-model-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRuntime } from "@/contexts/runtime-context";
import {
  type CanonicalProviderName,
  canonicalLabel,
  listConfiguredProviders,
  type ProvidersConfig,
} from "@/services/providers-store";

interface CatalogModel {
  modelId: string;
  label: string;
}

function listCanonicalModels(provider: CanonicalProviderName): CatalogModel[] {
  const catalog = createDefaultCatalog();
  const out: CatalogModel[] = [];
  for (const entry of Object.values(catalog) as ModelConfig[]) {
    if (entry.runtime !== "remote") continue;
    if (entry.provider !== provider) continue;
    out.push({ modelId: entry.modelId, label: entry.label ?? entry.modelId });
  }
  return out;
}

export const LOCAL_PROVIDER_ID = "local";

export interface LocalPickerEntry {
  catalogKey: string;
  label: string;
}

/**
 * Build the list of local catalog entries available for picking. An entry
 * is "available" when its status is `ready` (loaded in memory) or
 * `downloaded` (weights cached, can be activated on demand).
 */
export function buildLocalPickerEntries(
  statuses: ReadonlyMap<string, { config: ModelConfig; status: string }>,
): LocalPickerEntry[] {
  const out: LocalPickerEntry[] = [];
  for (const [key, state] of statuses) {
    if (state.config.runtime !== "local") continue;
    if (state.status === "ready" || state.status === "downloaded") {
      out.push({
        catalogKey: key,
        label: (state.config as LocalModelConfig).label ?? key,
      });
    }
  }
  return out;
}

/**
 * Unload the active local model when the user switches the active
 * provider away from `local`. No-op for local→local or remote→anything.
 */
export function deactivateOnLocalToRemoteSwitch(
  manager: { deactivate: (key: string) => void },
  prevProviderId: string | undefined,
  prevModelId: string | undefined,
  nextProviderId: string | undefined,
): void {
  if (prevProviderId !== LOCAL_PROVIDER_ID) return;
  if (nextProviderId === LOCAL_PROVIDER_ID) return;
  if (!prevModelId) return;
  manager.deactivate(prevModelId);
}

export interface ActiveModelPickerProps {
  config: ProvidersConfig;
  providerId: string | undefined;
  modelId: string | undefined;
  onChange: (
    providerId: string | undefined,
    modelId: string | undefined,
  ) => void;
}

export function ActiveModelPicker({
  config,
  providerId,
  modelId,
  onChange,
}: ActiveModelPickerProps): React.ReactElement {
  const { manager } = useRuntime();
  const statuses = useModelStatuses(manager);
  const { state: activate, activate: doActivate } = useActivateLocal(manager);

  const configured = useMemo(() => listConfiguredProviders(config), [config]);

  const localEntries = useMemo(
    () => buildLocalPickerEntries(statuses),
    [statuses],
  );

  if (configured.length === 0 && localEntries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Save credentials for at least one provider, or download a local model,
        to enable the model picker.
      </p>
    );
  }

  const isLocal = providerId === LOCAL_PROVIDER_ID;
  const active = configured.find((p) => p.id === providerId);
  const isCanonical = active?.kind === "canonical";
  const canonicalModels = isCanonical
    ? listCanonicalModels(active.providerName as CanonicalProviderName)
    : [];

  const handleProviderChange = (next: string): void => {
    deactivateOnLocalToRemoteSwitch(
      manager,
      providerId,
      modelId,
      next || undefined,
    );
    onChange(next || undefined, undefined);
  };

  const handleLocalModelChange = async (next: string): Promise<void> => {
    if (!next) return;
    // If the model isn't ready yet, activate it. If it's already ready,
    // activate is a no-op-ish path that keeps it loaded.
    const state = statuses.get(next);
    if (state?.status === "ready") {
      onChange(LOCAL_PROVIDER_ID, next);
      return;
    }
    const ok = await doActivate(next);
    if (ok) onChange(LOCAL_PROVIDER_ID, next);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label>Provider</Label>
        <Select
          value={providerId ?? ""}
          onValueChange={(next) => void handleProviderChange(next)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pick a provider…" />
          </SelectTrigger>
          <SelectContent>
            {configured.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="font-medium">{p.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {p.kind === "canonical"
                    ? canonicalLabel(p.providerName as CanonicalProviderName)
                    : "OpenAI-compatible"}
                </span>
              </SelectItem>
            ))}
            {localEntries.length > 0 ? (
              <SelectItem value={LOCAL_PROVIDER_ID}>
                <span className="font-medium">Local</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  Browser (WebLLM / Transformers.js)
                </span>
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Model</Label>
        {isLocal ? (
          <div className="flex items-center gap-2">
            <Select
              value={modelId ?? ""}
              onValueChange={(next) => void handleLocalModelChange(next)}
              disabled={activate.activatingKey != null}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a local model…" />
              </SelectTrigger>
              <SelectContent>
                {localEntries.map((e) => (
                  <SelectItem key={e.catalogKey} value={e.catalogKey}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activate.activatingKey ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>
        ) : isCanonical ? (
          <Select
            value={modelId ?? ""}
            onValueChange={(next) => onChange(providerId, next || undefined)}
            disabled={!providerId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick a model…" />
            </SelectTrigger>
            <SelectContent>
              {canonicalModels.map((m) => (
                <SelectItem key={m.modelId} value={m.modelId}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            placeholder={
              providerId
                ? "Model ID (e.g. llama-3.1-8b-instruct)"
                : "Pick a provider first"
            }
            value={modelId ?? ""}
            disabled={!providerId}
            onChange={(e) => onChange(providerId, e.target.value || undefined)}
          />
        )}
      </div>
    </div>
  );
}
