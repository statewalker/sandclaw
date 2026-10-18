import { useAdapterValue } from "@statewalker/ui.view.react";
import { WorkspaceShellAdapter } from "@statewalker/workspace.browser";
import type { ReactElement } from "react";

/**
 * Leading header item that renders the active workspace label, e.g.
 * `SandClaw / my-folder`. Reads `WorkspaceShellAdapter` so the label
 * tracks state transitions (switch workspace, reconnect) without any
 * prop wiring.
 */
export function WorkspaceLabelHeader(): ReactElement {
  const state = useAdapterValue(WorkspaceShellAdapter, (a) => a.getState());
  const label = state.status === "ready" || state.status === "needs-permission" ? state.label : "";
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold">SandClaw</span>
      <span className="text-xs text-muted-foreground">/</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
