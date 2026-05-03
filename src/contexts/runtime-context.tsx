import type { Agent, AgentRuntime } from "@statewalker/ai-agent/runtime";
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
  /** Persist a new providers config and rebuild the runtime. */
  saveProviders: (next: ProvidersConfig) => Promise<void>;
  /** Force a fresh build (e.g., after editing providers.json out-of-band). */
  reload: () => Promise<void>;
  /** The system folder under the workspace root (e.g., `.settings`). */
  systemFolder: string;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

interface RuntimeProviderProps {
  children: ReactNode;
  files: FilesApi;
  systemFolder?: string;
}

export function RuntimeProvider({
  children,
  files,
  systemFolder = DEFAULT_SYSTEM_FOLDER,
}: RuntimeProviderProps): ReactNode {
  const [state, setState] = useState<RuntimeState>({ status: "loading" });
  const generationRef = useRef(0);

  const build = useCallback(
    async (config: ProvidersConfig): Promise<void> => {
      const generation = ++generationRef.current;
      setState({ status: "loading" });

      try {
        if (listConfiguredProviders(config).length === 0) {
          if (generation === generationRef.current) {
            setState({ status: "no-providers", config });
          }
          return;
        }

        const activeProviderId = config.active.providerId;
        const activeModelId = config.active.modelId;
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
    [files, systemFolder],
  );

  // Initial mount: load providers and build the runtime.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
    () => ({ state, saveProviders, reload, systemFolder }),
    [state, saveProviders, reload, systemFolder],
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
