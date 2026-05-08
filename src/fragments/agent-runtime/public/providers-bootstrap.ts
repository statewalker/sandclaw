import {
  createDefaultCatalog,
  ModelManager,
  ModelStateStore,
} from "@statewalker/ai-agent/models";
import { BaseClass } from "@statewalker/shared-baseclass";
import type { FilesApi } from "@statewalker/webrun-files";
import type { Workspace } from "@statewalker/workspace-api";
import { createRemoteProvider } from "@/services/create-remote-provider";
import { createManagerProvider } from "@/services/local-models/manager-provider";
import {
  emptyProvidersConfig,
  findConfiguredProvider,
  listConfiguredProviders,
  loadProvidersConfig,
  type ProvidersConfig,
  saveProvidersConfig,
} from "@/services/providers-store";
import type { ActiveModel } from "./active-model.js";
import type { AgentRuntimeAdapter, RuntimeState } from "./runtime-state.js";
import type { ActiveModelValue } from "./types.js";

const DEFAULT_SYSTEM_FOLDER = ".settings";

/**
 * Interim provider bootstrap. Public surface only because the
 * legacy `useRuntime()` shim in `contexts/runtime-context.tsx`
 * needs to read it via `useAdapter`. Replaced by the dedicated
 * `providers/` fragment in Wave 4.2 — at which point this whole
 * file (and its public export) is deleted. Wires the
 * existing `services/providers-store.ts` + `create-remote-provider`
 * + local `ModelManager` into the new `ActiveModel` adapter so the
 * agent-runtime manager has a non-empty `ActiveModel.get()` to
 * rebuild against.
 *
 * When Wave 4.2 lands the providers fragment replaces this whole
 * file; the agent-runtime fragment is unchanged because consumers
 * read through `ActiveModel` / `AgentRuntimeAdapter`.
 */

function normalizeFolder(folder: string): string {
  const trimmed = folder.replace(/^\/+|\/+$/g, "");
  return `/${trimmed}`;
}

function buildLocalModelManager(
  files: FilesApi,
  systemFolder: string,
): ModelManager {
  const catalog = createDefaultCatalog();
  const store = new ModelStateStore(catalog);
  const modelStoragePath = `${normalizeFolder(systemFolder)}/models`;
  return new ModelManager({ store, files, modelStoragePath });
}

function resolveActive(
  config: ProvidersConfig,
  manager: ModelManager,
): ActiveModelValue | null {
  const { providerId, modelId } = config.active;
  if (!providerId || !modelId) return null;

  if (providerId === "local") {
    if (!manager.store.peekActiveModel(modelId)) return null;
    return {
      kind: "local",
      providerId: "local",
      modelId,
      createProvider: () => createManagerProvider(manager, modelId),
    };
  }

  const remote = findConfiguredProvider(config, providerId);
  if (!remote) return null;
  return {
    kind: "remote",
    providerId: remote.id,
    modelId,
    createProvider: () =>
      createRemoteProvider(remote.providerName, remote.apiKey, remote.baseURL),
  };
}

/**
 * Workspace-adapter exposing the interim bootstrap surface to the
 * legacy `useRuntime()` shim. Self-hosts the local `ModelManager`
 * and the loaded `ProvidersConfig`. Reactive: `notify()` fires after
 * each `setValue`, so React consumers via `useAdapter(ProvidersBootstrap)`
 * + `useSyncExternalStore` re-render on every providers.json
 * mutation.
 */
export class ProvidersBootstrap extends BaseClass {
  /** Type-only declaration so TS sees this class as compatible with
   * `WorkspaceAdapter`'s weak shape. */
  declare close?: () => void | Promise<void>;

  private _manager: ModelManager | null = null;
  private _config: ProvidersConfig = emptyProvidersConfig;
  private _systemFolder = DEFAULT_SYSTEM_FOLDER;
  private _workspace: Workspace | null = null;
  private _activeModel: ActiveModel | null = null;
  private _adapter: AgentRuntimeAdapter | null = null;

  /** Wired by the fragment init when this adapter is constructed. */
  attach(opts: {
    workspace: Workspace;
    activeModel: ActiveModel;
    adapter: AgentRuntimeAdapter;
    systemFolder: string;
  }): void {
    this._workspace = opts.workspace;
    this._activeModel = opts.activeModel;
    this._adapter = opts.adapter;
    this._systemFolder = opts.systemFolder;
  }

  get manager(): ModelManager | null {
    return this._manager;
  }

  get config(): ProvidersConfig {
    return this._config;
  }

  get systemFolder(): string {
    return this._systemFolder;
  }

  /** Re-read providers.json from disk and re-derive ActiveModel. */
  async reload(): Promise<void> {
    if (!this._workspace) return;
    const config = await loadProvidersConfig(
      this._workspace.files,
      this._systemFolder,
    );
    this._setConfig(config);
  }

  /** Persist `next` and re-derive ActiveModel. */
  async saveProviders(next: ProvidersConfig): Promise<void> {
    if (!this._workspace) return;
    await saveProvidersConfig(this._workspace.files, this._systemFolder, next);
    this._setConfig(next);
  }

  /** Lifecycle: called from the fragment's onLoad listener. */
  async _onLoad(): Promise<void> {
    if (!this._workspace) return;
    try {
      this._manager = buildLocalModelManager(
        this._workspace.files,
        this._systemFolder,
      );
      // Best-effort reconciliation against engine-owned caches
      // (e.g. WebLLM IDB).
      this._manager.refreshLocalStatuses().catch(() => {
        /* best-effort */
      });
      const config = await loadProvidersConfig(
        this._workspace.files,
        this._systemFolder,
      );
      this._setConfig(config);
    } catch (error) {
      this._adapter?._setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      } satisfies RuntimeState);
    }
  }

  /** Lifecycle: called from the fragment's onUnload listener. */
  _onUnload(): void {
    if (this._manager) {
      for (const [key, { status }] of this._manager.store.getStates()) {
        if (status === "ready") this._manager.deactivate(key);
      }
    }
    this._manager = null;
    this._config = emptyProvidersConfig;
    this._activeModel?.clear();
    this.notify();
  }

  private _setConfig(next: ProvidersConfig): void {
    this._config = next;
    if (!this._manager || !this._activeModel || !this._adapter) {
      this.notify();
      return;
    }
    const resolved = resolveActive(next, this._manager);
    // Manager writes `ready` / `error` when ActiveModel is non-null;
    // the bootstrap is responsible for surfacing the no-providers /
    // no-active-model UX states.
    if (!resolved) {
      const noRemote =
        listConfiguredProviders(next).length === 0 &&
        next.active.providerId !== "local";
      this._adapter._setState({
        status: noRemote ? "no-providers" : "no-active-model",
      });
    }
    this._activeModel.set(resolved);
    this.notify();
  }
}
