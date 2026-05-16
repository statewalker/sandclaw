import { useAppWorkspace } from "@statewalker/core-react";
import { DockHost } from "@statewalker/dock";
import { useSyncExternalStore } from "react";

const PANEL_ID_PREFIX = "chat:";

/**
 * Returns the sessionId of the currently focused chat tab, or
 * `undefined` if no chat tab is focused (no panels at all, or the
 * focused panel is not a chat tab). Subscribes to
 * `DockHost.onActivePanelChange` so the SessionsPanel highlight
 * updates as the user moves between tabs.
 */
export function useFocusedChatTab(): string | undefined {
  const workspace = useAppWorkspace();
  const dockHost = workspace.requireAdapter(DockHost);
  const subscribe = (onChange: () => void): (() => void) =>
    dockHost.onActivePanelChange(onChange);
  const getSnapshot = (): string | undefined => {
    const panelId = dockHost.getActivePanelId();
    if (!panelId || !panelId.startsWith(PANEL_ID_PREFIX)) return undefined;
    return panelId.slice(PANEL_ID_PREFIX.length);
  };
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
