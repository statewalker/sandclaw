import type { ReactElement } from "react";
import { useAdapterValue } from "@/fragments/core-views";
import { WorkspaceShellAdapter } from "@/fragments/workspace-bridge";

/**
 * Leading header item that renders the active workspace label, e.g.
 * `Chat Mini / my-folder`. Reads `WorkspaceShellAdapter` so the label
 * tracks state transitions (switch workspace, reconnect) without any
 * prop wiring.
 */
export function WorkspaceLabelHeader(): ReactElement {
  const state = useAdapterValue(WorkspaceShellAdapter, (a) => a.getState());
  const label =
    state.status === "ready" || state.status === "needs-permission"
      ? state.label
      : "";
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold">Chat Mini</span>
      <span className="text-xs text-muted-foreground">/</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
