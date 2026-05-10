import {
  STANDARD_TURN_BLOCK_KINDS,
  type TurnBlockContribution,
  turnBlocksSlot,
} from "@repo/chat-mini.chat";
import {
  type Message,
  NodeType,
  type ToolCall,
  type Turn,
} from "@statewalker/ai-agent/state";
import {
  useAdapter,
  useSlot,
  useViewRegistry,
} from "@statewalker/core-react";
import { Slots } from "@statewalker/shared-slots";
import { type ComponentType, type ReactElement, useMemo } from "react";
import { useNodeChildren } from "./hooks/use-session-node.js";

type TurnChild = Turn["children"][number];

interface ToolCallsRun {
  kind: typeof STANDARD_TURN_BLOCK_KINDS.TOOL_CALLS;
  /** Stable key derived from the first call's id — keeps React reconciliation
   *  happy when more tool calls join the run mid-stream. */
  key: string;
  payload: { calls: ToolCall[] };
}

interface SingleItem {
  kind: string;
  key: string;
  payload: unknown;
}

type RenderItem = ToolCallsRun | SingleItem;

/**
 * Walks the turn's children once and groups consecutive tool calls
 * into a single render item, then maps each remaining child to a
 * standard turn-block kind. Plug-in node types fall through to
 * `chat:turn-block:<NodeType>` so a plug-in fragment can register
 * a renderer without editing this dispatch.
 */
function groupChildren(children: readonly TurnChild[]): RenderItem[] {
  const items: RenderItem[] = [];
  let run: ToolCallsRun | null = null;
  for (const child of children) {
    if (child.type === NodeType.toolCall) {
      const call = child as ToolCall;
      if (run) {
        run.payload.calls.push(call);
      } else {
        run = {
          kind: STANDARD_TURN_BLOCK_KINDS.TOOL_CALLS,
          key: `tools:${call.id}`,
          payload: { calls: [call] },
        };
        items.push(run);
      }
      continue;
    }
    run = null;
    const kind =
      child.type === NodeType.userMessage
        ? STANDARD_TURN_BLOCK_KINDS.USER_MESSAGE
        : child.type === NodeType.agentMessage
          ? STANDARD_TURN_BLOCK_KINDS.AGENT_MESSAGE
          : child.type === NodeType.error
            ? STANDARD_TURN_BLOCK_KINDS.ERROR
            : `chat:turn-block:${child.type}`;
    const payload =
      child.type === NodeType.userMessage ||
      child.type === NodeType.agentMessage
        ? { message: child as Message }
        : child.type === NodeType.error
          ? { text: child.content ?? "" }
          : { node: child };
    items.push({ kind, key: child.id, payload });
  }
  return items;
}

/**
 * `TurnView` walks `turn.children`, groups consecutive tool calls,
 * and dispatches each item via the `chat:turn-blocks` slot. The
 * slot maps `kind → viewKey`; the component is then resolved from
 * `ViewRegistry`. Built-in renderers live alongside plug-in
 * contributions in the same wiring path — there is no special
 * built-in dispatch inside this component.
 */
export function TurnView({ turn }: { turn: Turn }): ReactElement {
  // Structural subscription only — token streaming into existing messages
  // does NOT re-render this component, only the affected MessageView.
  useNodeChildren(turn);

  const slots = useAdapter(Slots);
  // Subscribed adapter — re-renders when a late-registered viewKey
  // arrives (plug-in extensibility path).
  const registry = useViewRegistry();
  const turnBlocks = useSlot(slots, turnBlocksSlot);
  const viewByKind = useMemo(() => indexByKind(turnBlocks), [turnBlocks]);

  const items = groupChildren(turn.children);
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const viewKey = viewByKind.get(item.kind);
        const Component = viewKey ? registry.get(viewKey) : null;
        if (!Component) return null;
        const Cast = Component as ComponentType<{ props: unknown }>;
        return <Cast key={item.key} props={item.payload} />;
      })}
    </div>
  );
}

function indexByKind(
  contributions: readonly TurnBlockContribution[],
): Map<string, string> {
  const out = new Map<string, string>();
  // First-claim-wins to mirror the Intents convention; plug-in
  // fragments register before built-ins to override.
  for (const c of contributions) {
    if (!out.has(c.kind)) out.set(c.kind, c.viewKey);
  }
  return out;
}
