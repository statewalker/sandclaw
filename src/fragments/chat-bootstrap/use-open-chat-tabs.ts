import { useCallback, useRef, useSyncExternalStore } from "react";
import { useAppWorkspace } from "@/contexts/app-workspace-context";
import { DockHost } from "../dock/index.js";

const PANEL_ID_PREFIX = "chat:";

/**
 * Returns the set of session ids that currently have an open chat
 * tab in the dock host. Subscribes to layout changes so the
 * SessionsPanel highlight updates as tabs open and close.
 *
 * The cached Set is reused across renders unless the underlying
 * panel-id list changes — required so `useSyncExternalStore`
 * doesn't infinite-loop on a fresh-Set-per-call snapshot.
 */
export function useOpenChatTabs(): ReadonlySet<string> {
  const workspace = useAppWorkspace();
  const dockHost = workspace.requireAdapter(DockHost);
  const cacheRef = useRef<{ key: string; value: ReadonlySet<string> }>({
    key: "",
    value: new Set(),
  });

  const subscribe = useCallback(
    (onChange: () => void) => dockHost.onLayoutChange(onChange),
    [dockHost],
  );

  const getSnapshot = useCallback((): ReadonlySet<string> => {
    const ids: string[] = [];
    for (const panelId of dockHost.getPanelIds()) {
      if (
        panelId.startsWith(PANEL_ID_PREFIX) &&
        panelId.length > PANEL_ID_PREFIX.length
      ) {
        ids.push(panelId.slice(PANEL_ID_PREFIX.length));
      }
    }
    ids.sort();
    const key = ids.join("\n");
    if (cacheRef.current.key !== key) {
      cacheRef.current = { key, value: new Set(ids) };
    }
    return cacheRef.current.value;
  }, [dockHost]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
