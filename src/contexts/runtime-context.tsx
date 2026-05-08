import {
  AgentRuntimeAdapter,
  type RuntimeState,
} from "@/fragments/agent-runtime";
import {
  emptyProvidersConfig,
  Providers,
  type ProvidersConfig,
} from "@/fragments/providers";
import { useAdapter } from "@/fragments/workspace-bridge-views";
import { useAdapterValue } from "@/lib/use-adapter-value";

export const DEFAULT_SYSTEM_FOLDER = ".settings";

/**
 * Legacy compatibility shim. The runtime state machine lives in
 * `@/fragments/agent-runtime`; the providers config lives in
 * `@/fragments/providers`. This module exposes the same hook
 * surface as the pre-Wave-4 React context so existing components
 * migrate incrementally.
 */
export interface RuntimeContextValue {
  state: RuntimeState;
  saveProviders: (next: ProvidersConfig) => Promise<void>;
  reload: () => Promise<void>;
  systemFolder: string;
}

export function useRuntime(): RuntimeContextValue {
  const providers = useAdapter(Providers);
  const state = useAdapterValue(AgentRuntimeAdapter, (a) => a.getState());
  // Bind the providers config so re-renders fire on save.
  useAdapterValue(Providers, (p) => p.config);

  return {
    state,
    saveProviders: (next) => providers.saveProviders(next),
    reload: () => providers.reload(),
    systemFolder: providers.systemFolder,
  };
}

export function useProvidersConfig(): ProvidersConfig {
  return useAdapterValue(Providers, (p) => p.config) ?? emptyProvidersConfig;
}
