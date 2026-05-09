import type { AdapterCtor, WorkspaceAdapter } from "@statewalker/workspace-api";
import { useSyncExternalStore } from "react";
import { useAdapter } from "@/fragments/workspace-bridge-views";

/**
 * Structural shape of `IdentifiableRegistry<T>` that `useRegistry`
 * consumes — the only fields required for React subscription.
 * Typed structurally (rather than via the concrete generic) so
 * subclasses with different `T` parameters are accepted without
 * variance gymnastics.
 */
interface SubscribableRegistry extends WorkspaceAdapter {
  readonly version: number;
  observe(cb: () => void): () => void;
}

/**
 * Subscribe to an `IdentifiableRegistry` adapter and re-render
 * whenever its contents change. Returns the registry instance so
 * callers can `.get(id)` against the latest snapshot.
 *
 * Example:
 *   const registry = useRegistry(ViewRegistry);
 *   const Component = registry.get(viewKey);
 *
 * Implementation detail: snapshot is `registry.version` (a counter
 * bumped on every register/dispose). This is what makes the
 * subscription actually trigger re-renders — passing the registry
 * reference itself as the snapshot would never change with
 * `Object.is`, so React would bail.
 */
export function useRegistry<R extends SubscribableRegistry>(
  adapterCtor: AdapterCtor<R>,
): R {
  const registry = useAdapter(adapterCtor);
  useSyncExternalStore(
    (cb) => registry.observe(() => cb()),
    () => registry.version,
    () => registry.version,
  );
  return registry;
}
