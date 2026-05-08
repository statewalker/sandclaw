import type { Message, ToolCall } from "@statewalker/ai-agent/state";
import type { ReactElement } from "react";
import { ErrorBlock } from "@/screens/chat/components/error-block";
import { MessageView } from "@/screens/chat/components/message-view";
import { ToolCallsBlock } from "@/screens/chat/components/tool-calls-block";

/**
 * Adapter components that bridge the slot-pattern's `{ props: unknown }`
 * shape to the existing chat-screen components. Registered into
 * `ViewRegistry` under `STANDARD_TURN_BLOCK_KINDS.*` viewKeys by the
 * chat-views init. Each one casts `props` to the kind-specific
 * payload shape produced by `TurnView.groupChildren`.
 */

export function UserMessageBlock({ props }: { props: unknown }): ReactElement {
  const { message } = props as { message: Message };
  return <MessageView message={message} />;
}

export function AgentMessageBlock({ props }: { props: unknown }): ReactElement {
  const { message } = props as { message: Message };
  return <MessageView message={message} />;
}

export function ToolCallsRunBlock({ props }: { props: unknown }): ReactElement {
  const { calls } = props as { calls: ToolCall[] };
  return <ToolCallsBlock calls={calls} />;
}

export function ErrorTurnBlock({ props }: { props: unknown }): ReactElement {
  const { text } = props as { text: string };
  return <ErrorBlock text={text} />;
}
