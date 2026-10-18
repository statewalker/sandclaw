import { createStateStore, type StateStore } from "@json-render/core";
import { JSONUIProvider, Renderer } from "@json-render/react";
import {
  LocalModels,
  makeLocalModelsTabInitialState,
  makeLocalModelsTabSpec,
} from "@statewalker/ai-local-models.core";
import { useAppWorkspace } from "@statewalker/ui.view.react";
import { type ReactElement, useEffect, useMemo } from "react";
import { buildLocalActionHandlers } from "./action-handlers.js";
import { buildAiLocalModelsRegistry } from "./build-react-catalog.js";
import { bindLocalModels } from "./state-bridge.js";

/**
 * Renders the Settings dialog's "Local Models" tab body. Mounted via
 * `settings:tabs`. Owns its own `StateStore`; mirrors the `LocalModels`
 * adapter (downloaded set + status) through `bindLocalModels`.
 */
export function AiLocalModelsTab(): ReactElement {
  const workspace = useAppWorkspace();
  const localModels = workspace.requireAdapter(LocalModels);

  const store: StateStore = useMemo(() => createStateStore(makeLocalModelsTabInitialState()), []);
  const spec = useMemo(() => makeLocalModelsTabSpec(), []);
  const actionHandlers = useMemo(
    () => buildLocalActionHandlers({ workspace, store }),
    [workspace, store],
  );
  const registry = useMemo(
    () => buildAiLocalModelsRegistry({ actions: actionHandlers }).registry,
    [actionHandlers],
  );

  useEffect(() => {
    return bindLocalModels(store, localModels);
  }, [store, localModels]);

  return (
    <JSONUIProvider registry={registry} store={store} handlers={actionHandlers}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}
