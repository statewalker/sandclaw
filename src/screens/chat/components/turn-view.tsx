import {
  type Message,
  NodeType,
  type ToolCall,
  type Turn,
} from "@statewalker/ai-agent/state";
import type { ReactElement } from "react";
import { useNodeChildren } from "@/screens/chat/hooks/use-session-node";
import { ErrorBlock } from "./error-block";
import { MessageView } from "./message-view";
import { ToolCallsBlock } from "./tool-calls-block";

type TurnChild = Turn["children"][number];

interface ToolCallsRun {
  kind: "tool-calls";
  /** Stable key derived from the first call's id — keeps React reconciliation
   *  happy when more tool calls join the run mid-stream. */
  key: string;
  calls: ToolCall[];
}

interface SingleChild {
  kind: "single";
  child: TurnChild;
}

type RenderItem = ToolCallsRun | SingleChild;

/**
 * Walks the turn's children once and groups consecutive tool calls
 * into a single render item. Non-tool-call children are passed
 * through. The agent typically emits tool calls in a contiguous
 * burst (one or more, then the assistant message resumes), so this
 * groups them visually under one collapsible Reasoning step.
 */
function groupChildren(children: readonly TurnChild[]): RenderItem[] {
  const items: RenderItem[] = [];
  let run: ToolCallsRun | null = null;
  for (const child of children) {
    if (child.type === NodeType.toolCall) {
      const call = child as ToolCall;
      if (run) {
        run.calls.push(call);
      } else {
        run = { kind: "tool-calls", key: `tools:${call.id}`, calls: [call] };
        items.push(run);
      }
    } else {
      run = null;
      items.push({ kind: "single", child });
    }
  }
  return items;
}

export function TurnView({ turn }: { turn: Turn }): ReactElement {
  // Structural subscription only — token streaming into existing messages
  // does NOT re-render this component, only the affected MessageView.
  useNodeChildren(turn);
  const items = groupChildren(turn.children);
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        if (item.kind === "tool-calls") {
          return <ToolCallsBlock key={item.key} calls={item.calls} />;
        }
        const child = item.child;
        switch (child.type) {
          case NodeType.userMessage:
          case NodeType.agentMessage:
            return <MessageView key={child.id} message={child as Message} />;
          case NodeType.error:
            return <ErrorBlock key={child.id} text={child.content ?? ""} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
