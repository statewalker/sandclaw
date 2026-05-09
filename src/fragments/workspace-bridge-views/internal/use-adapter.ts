import type { AdapterCtor, WorkspaceAdapter } from "@statewalker/workspace-api";
import { useAppWorkspace } from "./app-workspace-provider.js";

/**
 * Single React idiom for reading a workspace adapter from inside
 * any view component:
 *
 *   const intents = useAdapter(Intents);
 *   const slots   = useAdapter(Slots);
 *
 * Equivalent to `useAppWorkspace().requireAdapter(key)` but reads
 * better at call sites and centralises the indirection so future
 * changes (e.g. error boundaries on missing adapters) live in one
 * place.
 *
 * `useAppWorkspace()` and `useAdapter()` together form the single
 * canonical entry point for renderer fragments needing the
 * workspace or its adapters in React.
 */
export function useAdapter<T extends WorkspaceAdapter>(key: AdapterCtor<T>): T {
  return useAppWorkspace().requireAdapter(key);
}
