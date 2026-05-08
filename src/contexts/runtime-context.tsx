import { useSyncExternalStore } from "react";
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
  const adapter = useAdapter(AgentRuntimeAdapter);
  const providers = useAdapter(Providers);

  const adapterState = useSyncExternalStore(
    (cb) => adapter.onUpdate(cb),
    () => adapter.getState(),
    () => adapter.getState(),
  );
  useSyncExternalStore(
    (cb) => providers.onUpdate(cb),
    () => providers.config,
    () => providers.config,
  );

  return {
    state: adapterState,
    saveProviders: (next) => providers.saveProviders(next),
    reload: () => providers.reload(),
    systemFolder: providers.systemFolder,
  };
}

export function useProvidersConfig(): ProvidersConfig {
  const providers = useAdapter(Providers);
  return (
    useSyncExternalStore(
      (cb) => providers.onUpdate(cb),
      () => providers.config,
      () => providers.config,
    ) ?? emptyProvidersConfig
  );
}
