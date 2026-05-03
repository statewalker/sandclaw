import { type Message, NodeType } from "@statewalker/ai-agent/state";
import { Markdown } from "@/components/session-tree/markdown";
import { ThinkingBlock } from "@/components/session-tree/thinking-block";
import { useNodeChildren, useNodeContent } from "@/hooks/use-session-node";
import { cn } from "@/lib/utils";

export function MessageView({
  message,
}: {
  message: Message;
}): React.ReactElement | null {
  const text = useNodeContent(message) ?? "";
  // Subscribe to children so thinking-block additions trigger a re-render.
  useNodeChildren(message);

  const isUser = message.type === NodeType.userMessage;
  const isAssistant = message.type === NodeType.agentMessage;

  if (!isUser && !isAssistant) return null;

  const thinkingBlocks = isAssistant ? message.thinkingBlocks : [];

  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-2 rounded-2xl border px-4 py-2.5 shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card text-card-foreground",
        )}
      >
        {thinkingBlocks.map((block) => (
          <ThinkingBlock key={block.id} block={block} />
        ))}
        {text ? (
          isAssistant ? (
            <Markdown text={text} />
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm">{text}</p>
          )
        ) : null}
      </div>
    </div>
  );
}
