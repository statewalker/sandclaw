import { Commands } from "@statewalker/shared-commands";
import { useAdapter } from "@statewalker/ui.view.react";
import { Button } from "@statewalker/ui.view.shadcn";
import { ChangeWorkspaceCommand, WorkspaceDisconnectCommand } from "@statewalker/workspace.browser";
import { LogOut } from "lucide-react";
import type { ReactElement } from "react";

/**
 * Trailing header item. Tears down the active workspace
 * (`workspace:disconnect`) and then opens the picker dialog
 * (`workspace:change` with no `files`). The two-step is necessary
 * because the change handler does not clear IndexedDB on its own —
 * `disconnect` does, and also fires `workspace.close()` to flush
 * `onUnload` listeners (per ADR 0001).
 */
export function SwitchWorkspaceButton(): ReactElement {
  const commands = useAdapter(Commands);
  const onClick = async (): Promise<void> => {
    await commands.call(WorkspaceDisconnectCommand, {}).promise;
    try {
      await commands.call(ChangeWorkspaceCommand, {}).promise;
    } catch (e) {
      // User cancellation throws AbortError; user already in `empty`.
      if (e instanceof DOMException && e.name === "AbortError") return;
      throw e;
    }
  };
  return (
    <Button size="sm" variant="ghost" onClick={() => void onClick()}>
      <LogOut className="h-3.5 w-3.5" /> Switch workspace
    </Button>
  );
}
