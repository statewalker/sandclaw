import { defineKeyedSlot, type KeyedSlotDeclaration } from "@statewalker/shared-slots";
import type { AppContext } from "./context.js";
import { getSlots } from "./systems.js";

/**
 * Views are slot contributions too. Logic fragments never hold components:
 * they place a view by its key (a dock panel, a header item, a settings tab
 * all carry a `viewKey`), and a renderer fragment registers the component
 * for that key. The kernel does not know what a component is; the renderer
 * layer narrows `C` (for React, `ComponentType`).
 *
 * The slot key is `core:views`, the same slot `@statewalker/ui.view.react`
 * declares as `coreViewsSlot`, so views registered here resolve in every
 * existing React host and vice versa.
 */
export const viewsSlot: KeyedSlotDeclaration<unknown> = defineKeyedSlot<unknown>("core:views");

/** Register `component` under `viewKey`. Returns the disposer. */
export function provideView<C>(ctx: AppContext, viewKey: string, component: C): () => void {
  return getSlots(ctx).register(viewsSlot, viewKey, component);
}

/** The component registered under `viewKey`, or `null`. */
export function getView<C>(ctx: AppContext, viewKey: string): C | null {
  return getSlots(ctx).get(viewsSlot, viewKey) as C | null;
}
