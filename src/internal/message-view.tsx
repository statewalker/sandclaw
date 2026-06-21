import {
  type Message as MessageNode,
  NodeType,
} from "@statewalker/ai-agent.core/state";
import { useAppWorkspace } from "@statewalker/ui.view.react";
import { VisualizeFileCommand } from "@statewalker/mime.core";
import { Commands } from "@statewalker/shared-commands";
import { type ReactElement, useMemo } from "react";
import type { Components } from "react-markdown";
import { useNodeChildren, useNodeContent } from "./hooks/use-session-node.js";
import { remarkFileUriLink } from "./lib/remark-file-uri-link.js";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "./prompt-kit/message.js";
import { ThinkingBlock } from "./thinking-block";

const REMARK_PLUGINS = [remarkFileUriLink];

/**
 * Identity-style URL transform that lets `file://` through. ReactMarkdown's
 * default sanitizer strips `file:` URLs (treats them as unsafe); the chat
 * surface trusts file:// URIs because they're routed through
 * `runVisualizeFile` (workspace-scoped command), not navigated to.
 */
function urlTransform(url: string): string {
  if (url.startsWith("file://")) return url;
  // Replicate ReactMarkdown's default for everything else.
  const colon = url.indexOf(":");
  if (colon === -1) return url;
  const protocol = url.slice(0, colon).toLowerCase();
  if (
    protocol === "http" ||
    protocol === "https" ||
    protocol === "mailto" ||
    protocol === "tel"
  ) {
    return url;
  }
  return "";
}

export function MessageView({
  message,
}: {
  message: MessageNode;
}): ReactElement | null {
  const text = useNodeContent(message) ?? "";
  // Subscribe to children so thinking-block additions trigger a re-render.
  useNodeChildren(message);

  const workspace = useAppWorkspace();
  const commands = workspace.requireAdapter(Commands);
  const components = useMemo<Partial<Components>>(
    () => ({
      a: ({ href, children, ...props }) => {
        if (typeof href === "string" && href.startsWith("file://")) {
          return (
            <a
              href={href}
              {...props}
              onClick={(event) => {
                event.preventDefault();
                void commands
                  .call(VisualizeFileCommand, { uri: href })
                  .promise.catch((error: unknown) => {
                    console.warn("[chat] file:// visualize failed:", error);
                  });
              }}
            >
              {children}
            </a>
          );
        }
        return (
          <a href={href} {...props}>
            {children}
          </a>
        );
      },
    }),
    [commands],
  );

  const isUser = message.type === NodeType.userMessage;
  const isAssistant = message.type === NodeType.agentMessage;
  if (!isUser && !isAssistant) return null;

  if (isUser) {
    // Prompt-kit "Message with Markdown" pattern: rounded-lg p-2
    // bg-secondary prose pill with the prompt-kit Markdown renderer
    // inside (handles inline code, fenced code blocks, lists, etc.).
    return (
      <Message className="justify-end">
        <MessageContent
          markdown
          remarkPlugins={REMARK_PLUGINS}
          components={components}
          urlTransform={urlTransform}
        >
          {text}
        </MessageContent>
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
          <MessageContent
            markdown
            className="bg-transparent p-0"
            remarkPlugins={REMARK_PLUGINS}
            components={components}
            urlTransform={urlTransform}
          >
            {text}
          </MessageContent>
        ) : null}
      </div>
    </Message>
  );
}
