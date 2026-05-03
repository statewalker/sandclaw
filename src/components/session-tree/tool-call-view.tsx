import type { ToolCall } from "@statewalker/ai-agent/state";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Wrench,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useNodeChildren, useNodeContent } from "@/hooks/use-session-node";
import { cn } from "@/lib/utils";

function formatJSON(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolCallView({ call }: { call: ToolCall }): React.ReactElement {
  // React to request → response child being added.
  useNodeChildren(call);
  const response = call.response;
  // Subscribe to streaming response content (mostly arrives whole, but some
  // tools stream).
  const responseContent = useNodeContent(response ?? call);
  const isError = call.isError;
  const hasResponse = !!response;

  const [open, setOpen] = useState(false);

  const status = !hasResponse ? "running" : isError ? "error" : "done";
  const StatusIcon =
    status === "running"
      ? Loader2
      : status === "error"
        ? XCircle
        : CheckCircle2;

  return (
    <div className="flex w-full justify-start">
      <div className="w-full max-w-[80%] rounded-2xl border bg-card text-card-foreground shadow-sm">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm">
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform",
                open && "rotate-90",
              )}
            />
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 font-mono text-xs">{call.toolName}</span>
            <StatusIcon
              className={cn(
                "h-4 w-4",
                status === "running" && "animate-spin text-muted-foreground",
                status === "done" && "text-green-600 dark:text-green-500",
                status === "error" && "text-destructive",
              )}
              aria-label={status}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-2 border-t px-4 py-3 text-xs">
            <div>
              <p className="mb-1 font-medium text-muted-foreground">Request</p>
              <pre className="overflow-x-auto rounded-md bg-muted px-2 py-1.5">
                {formatJSON(call.args ?? {})}
              </pre>
            </div>
            <div>
              <p className="mb-1 font-medium text-muted-foreground">
                {status === "running"
                  ? "Running…"
                  : status === "error"
                    ? "Error"
                    : "Result"}
              </p>
              {!hasResponse ? (
                <p className="text-muted-foreground italic">Waiting…</p>
              ) : (
                <pre
                  className={cn(
                    "overflow-x-auto whitespace-pre-wrap rounded-md px-2 py-1.5",
                    isError ? "bg-destructive/10 text-destructive" : "bg-muted",
                  )}
                >
                  {responseContent ?? ""}
                </pre>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
