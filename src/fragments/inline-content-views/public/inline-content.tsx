import { type ReactElement, useSyncExternalStore } from "react";
import {
  type InlineContentComponent,
  InlineContentRegistry,
  type InlineContentSpec,
} from "@/fragments/inline-content";
import { useAppWorkspace } from "@/fragments/workspace-bridge-views";

/**
 * Resolves `spec.componentId` against the workspace's
 * `InlineContentRegistry` and renders the resulting component
 * with the spec's props. Subscribes to the registry so a
 * late-registered component (plug-in path) renders without a
 * remount.
 *
 * Unknown component ids render a small inline error chip — the
 * agent's structured output is the trust boundary here, so an
 * unknown id should be visible (not silently swallowed).
 */
export function InlineContent({
  spec,
}: {
  spec: InlineContentSpec;
}): ReactElement {
  const workspace = useAppWorkspace();
  const registry = workspace.requireAdapter(InlineContentRegistry);

  const Component = useSyncExternalStore<InlineContentComponent | null>(
    (notify) => registry.observe(notify),
    () => registry.get(spec.componentId),
  );

  if (!Component) {
    return (
      <span className="rounded-sm bg-destructive/10 px-2 py-0.5 font-mono text-xs text-destructive">
        Unknown inline component: {spec.componentId}
      </span>
    );
  }
  return <Component props={spec.props} />;
}
