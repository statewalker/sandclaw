import type { StateStore } from "@json-render/core";
import { type LocalModels, localCatalog } from "@statewalker/ai-local-models.core";

/**
 * A flattened local-model row for the Local Models tab. Combines the
 * curated catalog entry (keyed by its real catalog key) with the
 * adapter's persisted config + current download status.
 */
export interface LocalModelRow {
  key: string;
  modelId: string;
  label: string;
  family: string;
  size: string;
  description: string;
  status: string;
  downloaded: boolean;
  active: boolean;
}

function flattenLocalModels(localModels: LocalModels): LocalModelRow[] {
  const cfg = localModels.config;
  const downloadedSet = new Set(cfg.downloaded.map((d) => d.key));
  return Object.entries(localCatalog).map(([key, entry]) => {
    const status = localModels.status(key);
    return {
      key,
      modelId: entry.modelId,
      label: entry.label,
      family: entry.family,
      size: entry.size,
      description: entry.description,
      status,
      downloaded: downloadedSet.has(key) || status === "downloaded" || status === "ready",
      active: cfg.active === key,
    };
  });
}

/**
 * Mirror `/persistent/localModelsList` from the curated catalog + the
 * `LocalModels` adapter. Seeds synchronously, then re-pushes on every
 * adapter notification. Returns a disposer.
 */
export function bindLocalModels(store: StateStore, localModels: LocalModels): () => void {
  const push = (): void => {
    store.update({ "/persistent/localModelsList": flattenLocalModels(localModels) });
  };
  push();
  return localModels.onUpdate(push);
}
