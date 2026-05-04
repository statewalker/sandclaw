import {
  createDefaultCatalog,
  ModelManager,
  ModelStateStore,
  mergeCatalogs,
} from "@statewalker/ai-agent/models";
import type { Agent, AgentRuntime } from "@statewalker/ai-agent/runtime";
import {
  registerWebLLMProvider,
  webllmCatalog,
} from "@statewalker/ai-provider-browser";
import type { FilesApi } from "@statewalker/webrun-files";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRemoteProvider } from "@/services/create-remote-provider";
import { webGpuAvailable } from "@/services/local-models/engine-detection";
import { createManagerProvider } from "@/services/local-models/manager-provider";
import {
  emptyProvidersConfig,
  findConfiguredProvider,
  listConfiguredProviders,
  loadProvidersConfig,
  type ProvidersConfig,
  saveProvidersConfig,
} from "@/services/providers-store";
import { wireRuntime } from "@/services/wire-runtime";

export const DEFAULT_SYSTEM_FOLDER = ".settings";
const AGENT_NAME = "chat";
const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant with access to tools for interacting with the local file system.

Use tools when their descriptions match the current goal. Provide concise, actionable answers.`;

export type RuntimeState =
  | { status: "loading" }
  | { status: "no-providers"; config: ProvidersConfig }
  | { status: "no-active-model"; config: ProvidersConfig }
  | { status: "error"; message: string }
  | {
      status: "ready";
      runtime: AgentRuntime;
      agent: Agent;
      activeProviderId: string;
      activeModelId: string;
      config: ProvidersConfig;
    };

interface RuntimeContextValue {
  state: RuntimeState;
  /** ModelManager for local-model lifecycle. Always present, but its
   * factories are only registered when WebGPU is available. */
  manager: ModelManager;
  /** Persist a new providers config and rebuild the runtime. */
  saveProviders: (next: ProvidersConfig) => Promise<void>;
  /** Force a fresh build (e.g., after editing providers.json out-of-band). */
  reload: () => Promise<void>;
  /** The system folder under the workspace root (e.g., `.settings`). */
  systemFolder: string;
}

export const RuntimeContext = createContext<RuntimeContextValue | null>(null);

interface RuntimeProviderProps {
  children: ReactNode;
  files: FilesApi;
  systemFolder?: string;
}

function normalizeFolder(folder: string): string {
  const trimmed = folder.replace(/^\/+|\/+$/g, "");
  return `/${trimmed}`;
}

function buildManager(files: FilesApi, systemFolder: string): ModelManager {
  const baseCatalog = createDefaultCatalog();
  const catalog = webGpuAvailable()
    ? mergeCatalogs(baseCatalog, webllmCatalog)
    : baseCatalog;
  const store = new ModelStateStore(catalog);
  // Persist weights under `<systemFolder>/models` so they sit alongside
  // sessions and providers.json instead of polluting the workspace root.
  const modelStoragePath = `${normalizeFolder(systemFolder)}/models`;
  const manager = new ModelManager({ store, files, modelStoragePath });
  if (webGpuAvailable()) {
    registerWebLLMProvider(manager, {
      basePath: `${modelStoragePath}/webllm`,
    });
  }
  return manager;
}

export function RuntimeProvider({
  children,
  files,
  systemFolder = DEFAULT_SYSTEM_FOLDER,
}: RuntimeProviderProps): ReactNode {
  const [state, setState] = useState<RuntimeState>({ status: "loading" });
  const generationRef = useRef(0);

  // One ModelManager per workspace. Survives runtime rebuilds.
  const managerRef = useRef<ModelManager | null>(null);
  if (managerRef.current === null) {
    managerRef.current = buildManager(files, systemFolder);
  }
  const manager = managerRef.current;

  const build = useCallback(
    async (config: ProvidersConfig): Promise<void> => {
      const generation = ++generationRef.current;
      setState({ status: "loading" });

      try {
        const isLocalActive = config.active.providerId === "local";
        const hasRemote = listConfiguredProviders(config).length > 0;

        if (!hasRemote && !isLocalActive) {
          if (generation === generationRef.current) {
            setState({ status: "no-providers", config });
          }
          return;
        }

        const activeProviderId = config.active.providerId;
        const activeModelId = config.active.modelId;

        // Local active path: the model must actually be loaded in the
        // manager. We never auto-activate on load — if the model isn't
        // ready, fall through to no-active-model so the user re-clicks
        // Activate from the Local-models tab.
        if (isLocalActive) {
          if (!activeModelId || !manager.store.peekActiveModel(activeModelId)) {
            if (generation === generationRef.current) {
              setState({ status: "no-active-model", config });
            }
            return;
          }
          const provider = createManagerProvider(manager, activeModelId);
          const runtime = await wireRuntime(files, [provider], {
            systemFolder,
          });
          const agent = runtime.createAgent({
            name: AGENT_NAME,
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            defaultModel: activeModelId,
          });
          if (generation === generationRef.current) {
            setState({
              status: "ready",
              runtime,
              agent,
              activeProviderId: "local",
              activeModelId,
              config,
            });
          }
          return;
        }

        // Remote active path.
        const activeProvider = findConfiguredProvider(config, activeProviderId);
        if (!activeProvider || !activeModelId) {
          if (generation === generationRef.current) {
            setState({ status: "no-active-model", config });
          }
          return;
        }

        const provider = createRemoteProvider(
          activeProvider.providerName,
          activeProvider.apiKey,
          activeProvider.baseURL,
        );
        const runtime = await wireRuntime(files, [provider], { systemFolder });
        const agent = runtime.createAgent({
          name: AGENT_NAME,
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
          defaultModel: activeModelId,
        });

        if (generation === generationRef.current) {
          setState({
            status: "ready",
            runtime,
            agent,
            activeProviderId: activeProvider.id,
            activeModelId,
            config,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (generation === generationRef.current) {
          setState({ status: "error", message });
        }
      }
    },
    [files, systemFolder, manager],
  );

  // Initial mount: load providers and build the runtime.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Reconcile local-model status against engine-owned caches
        // (e.g. WebLLM IDB) so previously-downloaded models surface as
        // `downloaded` instead of `not-downloaded` after a reload.
        manager.refreshLocalStatuses().catch(() => {
          /* best-effort */
        });
        const config = await loadProvidersConfig(files, systemFolder);
        if (cancelled) return;
        await build(config);
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
      generationRef.current += 1;
    };
  }, [files, systemFolder, build]);

  // Workspace tear-down: when `files` changes (or the provider unmounts),
  // deactivate any active local model and drop the manager so the next
  // workspace gets a fresh one.
  useEffect(() => {
    return () => {
      const m = managerRef.current;
      if (!m) return;
      for (const [key, { status }] of m.store.getStates()) {
        if (status === "ready") m.deactivate(key);
      }
      managerRef.current = null;
    };
  }, [files]);

  const saveProviders = useCallback(
    async (next: ProvidersConfig): Promise<void> => {
      await saveProvidersConfig(files, systemFolder, next);
      await build(next);
    },
    [files, systemFolder, build],
  );

  const reload = useCallback(async (): Promise<void> => {
    const config = await loadProvidersConfig(files, systemFolder);
    await build(config);
  }, [files, systemFolder, build]);

  const value = useMemo<RuntimeContextValue>(
    () => ({ state, manager, saveProviders, reload, systemFolder }),
    [state, manager, saveProviders, reload, systemFolder],
  );

  return (
    <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
  );
}

export function useRuntime(): RuntimeContextValue {
  const ctx = useContext(RuntimeContext);
  if (!ctx) {
    throw new Error("useRuntime must be used inside <RuntimeProvider>.");
  }
  return ctx;
}

/** Helper: returns the current providers config or an empty default. */
export function useProvidersConfig(): ProvidersConfig {
  const { state } = useRuntime();
  if (
    state.status === "ready" ||
    state.status === "no-providers" ||
    state.status === "no-active-model"
  ) {
    return state.config;
  }
  return emptyProvidersConfig;
}
