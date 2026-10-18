import {
  AI_LOCAL_MODELS_CATALOG_ID,
  LOCAL_MODELS_TAB_VIEW_KEY,
} from "@statewalker/ai-local-models.core";
import { catalogsSlot } from "@statewalker/render.core";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { coreViewsSlot, type ViewComponent } from "@statewalker/ui.view.react";
import { getWorkspace } from "@statewalker/workspace.core";
import { buildAiLocalModelsRegistry } from "../internal/build-react-catalog.js";
import { AiLocalModelsTab } from "../internal/local-models-tab.js";

/**
 * Renderer-fragment init for `ai-local-models.view.react`. Pairs with
 * `@statewalker/ai-local-models.core` (logic). Registers:
 *
 * 1. The local-models json-render Registry into `json:catalogs` (with
 *    no-op handlers — the tab host builds its own mount-scoped handlers).
 * 2. The Local Models settings-tab host into `core:views` under the
 *    viewKey contributed by the logic fragment's `settings:tabs` entry.
 */
export default function initAiLocalModelsReact(ctx: Record<string, unknown>): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);

  const [register, cleanup] = newRegistry();

  const stubHandlers: Record<string, () => Promise<void>> = {};
  const { registry } = buildAiLocalModelsRegistry({ actions: stubHandlers });
  register(slots.register(catalogsSlot, AI_LOCAL_MODELS_CATALOG_ID, registry));

  register(
    slots.register(
      coreViewsSlot,
      LOCAL_MODELS_TAB_VIEW_KEY,
      AiLocalModelsTab as unknown as ViewComponent,
    ),
  );

  return cleanup;
}
