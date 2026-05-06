import {
  type Message as MessageNode,
  NodeType,
} from "@statewalker/ai-agent/state";
import type { ReactElement } from "react";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/prompt-kit/message";
import {
  useNodeChildren,
  useNodeContent,
} from "@/screens/chat/hooks/use-session-node";
import { ThinkingBlock } from "./thinking-block";

export function MessageView({
  message,
}: {
  message: MessageNode;
}): ReactElement | null {
  const text = useNodeContent(message) ?? "";
  // Subscribe to children so thinking-block additions trigger a re-render.
  useNodeChildren(message);

  const isUser = message.type === NodeType.userMessage;
  const isAssistant = message.type === NodeType.agentMessage;
  if (!isUser && !isAssistant) return null;

  if (isUser) {
    // Prompt-kit "Message with Markdown" pattern: rounded-lg p-2
    // bg-secondary prose pill with the prompt-kit Markdown renderer
    // inside (handles inline code, fenced code blocks, lists, etc.).
    return (
      <Message className="justify-end">
        <MessageContent markdown>{text}</MessageContent>
      </Message>
    );
  }

  // Assistant: avatar + transparent markdown content (no bubble),
  // matching the prompt-kit reference layout. Thinking blocks
  // lift above the text but stay aligned with it.
  const thinkingBlocks = message.thinkingBlocks;
  return (
    <Message>
      <MessageAvatar src="" alt="AI" fallback="AI" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {thinkingBlocks.map((block) => (
          <ThinkingBlock key={block.id} block={block} />
        ))}
        {text ? (
          <MessageContent markdown className="bg-transparent p-0">
            {text}
          </MessageContent>
        ) : null}
      </div>
    </Message>
  );
}
