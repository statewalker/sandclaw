import { newSlot } from "@statewalker/shared-slots";
import type { ComposerAction, TurnBlockContribution } from "./types.js";

/**
 * `chat:turn-blocks` — Slot pattern C. Each contribution binds a
 * `kind` discriminator to a `viewKey` resolved against
 * `ViewRegistry`. `TurnView` walks each turn's children, computes
 * a kind per item, and looks up the contribution to render it.
 *
 * Built-in kinds (`STANDARD_TURN_BLOCK_KINDS`) are contributed by
 * the `chat-views` renderer fragment alongside ViewRegistry
 * bindings — the same wiring a plug-in fragment uses, no special
 * built-in path inside `TurnView`.
 */
export const [provideTurnBlock, observeTurnBlocks] =
  newSlot<TurnBlockContribution>("chat:turn-blocks");

/**
 * `chat:composer-actions` — Slot pattern C. Contributions render
 * inside the chat composer's actions row. Hard-coded Send/Stop
 * buttons stay in `Composer` (they own focus + draft state); slot
 * contributions appear leading or trailing per `position`.
 *
 * The model picker (Wave 7.1's first observable platform feature)
 * is contributed by the `providers/` fragment, with its React
 * binding registered into `ViewRegistry` by `providers-views/`.
 */
export const [provideComposerAction, observeComposerActions] =
  newSlot<ComposerAction>("chat:composer-actions");
