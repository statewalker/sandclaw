import { newSlot } from "@statewalker/shared-slots";
import type { InlineComponentDescriptor } from "./types.js";

/**
 * `inline-content:components` — discoverability slot. Each built-in
 * or plug-in inline component contributes a descriptor so tooling
 * can enumerate the available kinds. The actual React component is
 * registered separately into `InlineContentRegistry` (the rendering
 * lookup table). Slot pattern C — paired with a dedicated registry
 * class.
 */
export const [provideInlineComponent, observeInlineComponents] =
  newSlot<InlineComponentDescriptor>("inline-content:components");
