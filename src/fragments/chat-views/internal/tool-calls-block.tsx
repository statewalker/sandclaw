import type { ToolCall } from "@statewalker/ai-agent/state";
import { ChevronDown, Wrench } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/fragments/shadcn-views";
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
 * collapsible block, Steps-style — header with the wrench icon +
 * label + chevron, content as a plain stack of ToolCallViews. No
 * vertical connector bar (those make sense for a "thinking
 * narrative" but read as noise for tool runs). Each tool call
 * inside still uses the prompt-kit `Tool` component.
 *
 * Initial open: only if at least one call is in flight at mount.
 * Auto-closes on the first not-ready → ready transition; manual
 * toggles after that are respected.
 */
export function ToolCallsBlock({ calls }: { calls: ToolCall[] }): ReactElement {
  const allReady = useAllToolCallsReady(calls);
  const [open, setOpen] = useState(() => !allReady);
  const wasReady = useRef(allReady);
  useEffect(() => {
    if (allReady && !wasReady.current) setOpen(false);
    wasReady.current = allReady;
  }, [allReady]);

  const label =
    calls.length === 1 ? "Tool call" : `Tool calls (${calls.length})`;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/tools">
      <CollapsibleTrigger className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <Wrench className="size-3.5" />
        <span>{label}</span>
        <ChevronDown className="size-3.5 transition-transform group-data-[state=open]/tools:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2 overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        {calls.map((call) => (
          <ToolCallView key={call.id} call={call} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
