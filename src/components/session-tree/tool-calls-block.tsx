import type { ToolCall } from "@statewalker/ai-agent/state";
import { type ReactElement, useState } from "react";
import {
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from "@/components/prompt-kit/chain-of-thought";
import { ToolCallView } from "@/components/session-tree/tool-call-view";

/**
 * Renders a group of consecutive tool calls inside a single
 * collapsible `ChainOfThoughtStep` — same visual treatment as
 * `ThinkingBlock`. Each tool call inside still uses the standard
 * `ToolCallView` (Prompt Kit's `Tool` component), so the
 * per-call collapse + state mapping behavior is unchanged.
 *
 * Default open so the agent's tool activity is visible at a glance;
 * the user can collapse manually. Streaming-aware auto-collapse on
 * completion is a follow-up (mirrors the same deferral noted on
 * `ThinkingBlock`).
 */
export function ToolCallsBlock({ calls }: { calls: ToolCall[] }): ReactElement {
  const [open, setOpen] = useState(true);
  const label =
    calls.length === 1 ? "Tool call" : `Tool calls (${calls.length})`;
  return (
    <ChainOfThoughtStep open={open} onOpenChange={setOpen}>
      <ChainOfThoughtTrigger>{label}</ChainOfThoughtTrigger>
      <ChainOfThoughtContent>
        {calls.map((call) => (
          <ToolCallView key={call.id} call={call} />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThoughtStep>
  );
}
