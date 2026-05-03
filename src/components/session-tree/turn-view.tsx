import {
  type Message,
  NodeType,
  type ToolCall,
  type Turn,
} from "@statewalker/ai-agent/state";
import { ErrorBlock } from "@/components/session-tree/error-block";
import { MessageView } from "@/components/session-tree/message-view";
import { ToolCallView } from "@/components/session-tree/tool-call-view";
import { useNodeChildren } from "@/hooks/use-session-node";

export function TurnView({ turn }: { turn: Turn }): React.ReactElement {
  // Structural subscription only — token streaming into existing messages
  // does NOT re-render this component, only the affected MessageView.
  useNodeChildren(turn);
  return (
    <div className="flex flex-col gap-3">
      {turn.children.map((child) => {
        switch (child.type) {
          case NodeType.userMessage:
          case NodeType.agentMessage:
            return <MessageView key={child.id} message={child as Message} />;
          case NodeType.toolCall:
            return <ToolCallView key={child.id} call={child as ToolCall} />;
          case NodeType.error:
            return <ErrorBlock key={child.id} text={child.content ?? ""} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
