/**
 * Slot value contributed to `chat:turn-blocks`. The `kind` matches
 * the discriminator `TurnView` produces per group/item; `viewKey`
 * resolves a React component in `ViewRegistry` whose `props` is
 * the per-item payload (cast at the rendering boundary).
 *
 * Built-in kinds live in `STANDARD_TURN_BLOCK_KINDS`. Plug-in
 * fragments may use the same shape under their own kinds.
 */
export interface TurnBlockContribution {
  kind: string;
  viewKey: string;
}

/**
 * Stable string keys used by `TurnView`'s built-in dispatch and
 * by the `chat-views` renderer when registering its components.
 */
export const STANDARD_TURN_BLOCK_KINDS = {
  USER_MESSAGE: "chat:turn-block:user-message",
  AGENT_MESSAGE: "chat:turn-block:agent-message",
  TOOL_CALLS: "chat:turn-block:tool-calls",
  ERROR: "chat:turn-block:error",
} as const;

export type StandardTurnBlockKind =
  (typeof STANDARD_TURN_BLOCK_KINDS)[keyof typeof STANDARD_TURN_BLOCK_KINDS];

/**
 * Slot value contributed to `chat:composer-actions`. The composer
 * looks up `viewKey` in `ViewRegistry` and renders the resolved
 * component in the actions row, leading or trailing per `position`.
 * Lower `order` wins (renders first within its position group).
 */
export interface ComposerAction {
  /** Stable id; used as the React key. */
  id: string;
  viewKey: string;
  position?: "leading" | "trailing";
  order?: number;
}
