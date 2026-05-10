import type { Message } from "@statewalker/ai-agent/state";
import { useState } from "react";
import { useNodeContent } from "./hooks/use-session-node.js";
import {
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from "./prompt-kit/chain-of-thought.js";

export function ThinkingBlock({
  block,
}: {
  block: Message;
}): React.ReactElement {
  const text = useNodeContent(block) ?? "";
  // Default collapsed; the user toggles. Streaming-aware auto-expand
  // is a follow-up — see chat-mini-prompt-kit-surface spec §7.
  const [open, setOpen] = useState(false);
  return (
    <ChainOfThoughtStep open={open} onOpenChange={setOpen}>
      <ChainOfThoughtTrigger>Reasoning</ChainOfThoughtTrigger>
      <ChainOfThoughtContent>
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
          {text}
        </p>
      </ChainOfThoughtContent>
    </ChainOfThoughtStep>
  );
}
