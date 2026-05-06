import type { ToolCall } from "@statewalker/ai-agent/state";
import { Wrench } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";
import {
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from "@/components/prompt-kit/chain-of-thought";
import { ToolCallView } from "./tool-call-view";

/**
 * True once every call in `calls` has a `response` child. Subscribes
 * to each call's `onUpdate` so a streaming response arriving on any
 * call re-evaluates the predicate. Returns `false` while no call is
 * present (degenerate case — block never auto-closes from empty).
 */
function useAllToolCallsReady(calls: ToolCall[]): boolean {
  const computeReady = (): boolean =>
    calls.length > 0 && calls.every((c) => !!c.response);
  const [ready, setReady] = useState<boolean>(computeReady);
  useEffect(() => {
    setReady(computeReady());
    if (calls.length === 0) return;
    const unsubs = calls.map((call) =>
      call.onUpdate(() => {
        setReady(computeReady());
      }),
    );
    return () => {
      for (const u of unsubs) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls]);
  return ready;
}

/**
 * Renders a group of consecutive tool calls inside a single
 * collapsible `ChainOfThoughtStep` — same visual treatment as
 * `ThinkingBlock`. Each tool call inside still uses the standard
 * `ToolCallView` (Prompt Kit's `Tool` component), so the
 * per-call collapse + state mapping behavior is unchanged.
 *
 * Initial open state mirrors "is anything in flight?" — fresh
 * tool bursts mount with `open=true`; restored sessions where
 * every call already has a response mount with `open=false`.
 * Once all calls finish (not-ready → ready transition), the block
 * auto-closes; manual user toggles after that are respected.
 */
export function ToolCallsBlock({ calls }: { calls: ToolCall[] }): ReactElement {
  const allReady = useAllToolCallsReady(calls);
  // Initial open: only if at least one call is still in flight at mount.
  const [open, setOpen] = useState(() => !allReady);
  const wasReady = useRef(allReady);
  useEffect(() => {
    // Edge: not-ready → ready. Auto-close once.
    if (allReady && !wasReady.current) {
      setOpen(false);
    }
    wasReady.current = allReady;
  }, [allReady]);

  const label =
    calls.length === 1 ? "Tool call" : `Tool calls (${calls.length})`;
  return (
    <ChainOfThoughtStep open={open} onOpenChange={setOpen}>
      <ChainOfThoughtTrigger leftIcon={<Wrench className="size-3.5" />}>
        {label}
      </ChainOfThoughtTrigger>
      <ChainOfThoughtContent>
        {calls.map((call) => (
          <ToolCallView key={call.id} call={call} />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThoughtStep>
  );
}
