import type { ModelManager } from "@statewalker/ai-agent/models";
import { useSyncExternalStore } from "react";
import {
  AgentRuntimeAdapter,
  ProvidersBootstrap,
  type RuntimeState,
} from "@/fragments/agent-runtime";
import { useAdapter } from "@/fragments/workspace-bridge-views";
import {
  emptyProvidersConfig,
  type ProvidersConfig,
} from "@/services/providers-store";

export const DEFAULT_SYSTEM_FOLDER = ".settings";

/**
 * Legacy compatibility shim. The runtime state machine now lives in
 * `@/fragments/agent-runtime` (Wave 4.1). This module exposes the
 * same hook surface (`useRuntime`, `useProvidersConfig`) as the
 * pre-Wave-4 React context so existing components don't need to be
 * rewritten in a single PR — they're migrated to the slot-driven
 * model in Wave 4.2 alongside the providers fragment.
 */
export interface RuntimeContextValue {
  state: RuntimeState;
  /** Local-model manager. Only meaningful when local providers are
   * registered (currently disabled while WebLLM is dormant). */
  manager: ModelManager | null;
  saveProviders: (next: ProvidersConfig) => Promise<void>;
  reload: () => Promise<void>;
  systemFolder: string;
}

export function useRuntime(): RuntimeContextValue {
  const adapter = useAdapter(AgentRuntimeAdapter);
  const bootstrap = useAdapter(ProvidersBootstrap);

  // Two reactive sources, two subscriptions; both call the listener
  // through `BaseClass.onUpdate`.
  const adapterState = useSyncExternalStore(
    (cb) => adapter.onUpdate(cb),
    () => adapter.getState(),
    () => adapter.getState(),
  );
  useSyncExternalStore(
    (cb) => bootstrap.onUpdate(cb),
    () => bootstrap.config,
    () => bootstrap.config,
  );

  return {
    state: adapterState,
    manager: bootstrap.manager,
    saveProviders: (next) => bootstrap.saveProviders(next),
    reload: () => bootstrap.reload(),
    systemFolder: bootstrap.systemFolder,
  };
}

export function useProvidersConfig(): ProvidersConfig {
  const bootstrap = useAdapter(ProvidersBootstrap);
  return (
    useSyncExternalStore(
      (cb) => bootstrap.onUpdate(cb),
      () => bootstrap.config,
      () => bootstrap.config,
    ) ?? emptyProvidersConfig
  );
}
