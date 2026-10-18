import { createStateStore, type StateStore } from "@json-render/core";
import {
  AiConfig,
  makeConnectionsInitialState,
  makeConnectionsSpec,
} from "@statewalker/ai-config.core";
import { SpecRenderer } from "@statewalker/render.view.react";
import { useAppWorkspace } from "@statewalker/ui.view.react";
import { type ReactElement, useEffect, useMemo, useSyncExternalStore } from "react";
import { buildActionHandlers } from "./action-handlers.js";
import { buildConnectionsRegistry } from "./build-react-catalog.js";
import { createConnectionsBridge } from "./state-bridge.js";

/**
 * Settings-tab `ViewComponent` for the "Remote Models" connections panel.
 * Owns a per-mount json-render `StateStore`, builds the registry with
 * mount-scoped action handlers bound to `AiConfig`, wires the
 * `AiConfig → state` bridge, and renders the spec through `SpecRenderer`.
 *
 * The component lives outside `SpecRenderer`'s `JSONUIProvider`, so it watches
 * the store directly (`useSyncExternalStore`) and re-syncs the projection when
 * the active tab changes — there is no json-render state context out here.
 */
export function AiConfigConnectionsTab(): ReactElement {
  const workspace = useAppWorkspace();
  const aiConfig = workspace.requireAdapter(AiConfig);

  const store: StateStore = useMemo(() => createStateStore(makeConnectionsInitialState()), []);
  const spec = useMemo(() => makeConnectionsSpec(), []);
  const handlers = useMemo(() => buildActionHandlers({ aiConfig, store }), [aiConfig, store]);
  const registry = useMemo(
    () => buildConnectionsRegistry({ actions: handlers }).registry,
    [handlers],
  );
  const bridge = useMemo(() => createConnectionsBridge(store, aiConfig), [store, aiConfig]);
  useEffect(() => bridge.dispose, [bridge]);

  // Re-project when the selected tab changes (tab clicks write
  // `/ui/activeConnectionId` through the bound Tabs value).
  const activeId = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.get("/ui/activeConnectionId") as string,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-sync is keyed on activeId, bridge is stable
  useEffect(() => {
    bridge.sync();
  }, [activeId, bridge]);

  return <SpecRenderer spec={spec} registry={registry} store={store} handlers={handlers} />;
}
