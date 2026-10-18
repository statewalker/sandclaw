import { Commands } from "@statewalker/shared-commands";
import { useAdapter, useAdapterValue } from "@statewalker/ui.view.react";
import { Button } from "@statewalker/ui.view.shadcn";
import { WorkspaceReconnectCommand, WorkspaceShellAdapter } from "@statewalker/workspace.browser";
import { RefreshCw } from "lucide-react";
import type { ReactElement } from "react";

/**
 * Compact banner used by the empty-state view when the
 * `WorkspaceShellAdapter` is in `needs-permission`. Fires
 * `workspace:reconnect` from a user gesture so the underlying
 * `requestPermission()` call is allowed by the browser.
 */
export function ReconnectBanner(): ReactElement | null {
  const commands = useAdapter(Commands);
  const state = useAdapterValue(WorkspaceShellAdapter, (a) => a.getState());
  if (state.status !== "needs-permission") return null;
  return (
    <div className="flex items-center gap-3 border-b bg-muted px-4 py-2 text-sm">
      <span className="flex-1">
        Reconnect to workspace <span className="font-medium text-foreground">{state.label}</span>?
      </span>
      <Button size="sm" onClick={() => void commands.call(WorkspaceReconnectCommand, {}).promise}>
        <RefreshCw /> Reconnect
      </Button>
    </div>
  );
}
