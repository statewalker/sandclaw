import {
  type Message as MessageNode,
  NodeType,
} from "@statewalker/ai-agent/state";
import { Markdown } from "@/components/prompt-kit/markdown";
import { Message } from "@/components/prompt-kit/message";
import { ThinkingBlock } from "@/components/session-tree/thinking-block";
import { useNodeChildren, useNodeContent } from "@/hooks/use-session-node";
import { cn } from "@/lib/utils";

// Shared prose overrides — keep code/list/table styling consistent
// after migrating off the local Markdown wrapper.
const PROSE_OVERRIDES = cn(
  "prose prose-sm dark:prose-invert max-w-none wrap-break-word",
  "[--tw-prose-code:var(--foreground)]",
  "[--tw-prose-pre-code:var(--foreground)]",
  "[--tw-prose-pre-bg:var(--muted)]",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:my-0.5 [&_li>p]:my-0",
  "[&_li>ul]:my-1 [&_li>ol]:my-1",
  "[&_p]:my-2 [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-2",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-foreground",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-foreground",
  "[&_pre>code]:bg-transparent [&_pre>code]:p-0 [&_pre>code]:text-foreground",
  "[&_table]:my-2 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:px-2 [&_td]:py-1",
);

export function MessageView({
  message,
}: {
  message: MessageNode;
}): React.ReactElement | null {
  const text = useNodeContent(message) ?? "";
  // Subscribe to children so thinking-block additions trigger a re-render.
  useNodeChildren(message);

  const isUser = message.type === NodeType.userMessage;
  const isAssistant = message.type === NodeType.agentMessage;

  if (!isUser && !isAssistant) return null;

  const thinkingBlocks = isAssistant ? message.thinkingBlocks : [];

  return (
    <Message
      className={cn("w-full py-1", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-2",
          isAssistant && "w-full",
        )}
      >
        <div
          className={cn(
            "flex flex-col gap-2 rounded-2xl border px-4 py-2.5 shadow-sm",
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
              <Markdown className={PROSE_OVERRIDES}>{text}</Markdown>
            ) : (
              <p className="whitespace-pre-wrap wrap-break-word text-sm">
                {text}
              </p>
            )
          ) : null}
        </div>
      </div>
    </Message>
  );
}
