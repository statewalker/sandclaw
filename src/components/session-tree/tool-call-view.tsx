import type { ToolCall } from "@statewalker/ai-agent/state";
import { Tool, type ToolPart } from "@/components/prompt-kit/tool";
import { useNodeChildren, useNodeContent } from "@/hooks/use-session-node";

function asInputRecord(args: unknown): Record<string, unknown> | undefined {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  if (args === undefined) return undefined;
  // Wrap non-object args so the Tool component's keyed renderer can show them.
  return { value: args };
}

export function ToolCallView({ call }: { call: ToolCall }): React.ReactElement {
  // React to request → response child being added.
  useNodeChildren(call);
  const response = call.response;
  // Subscribe to streaming response content (mostly arrives whole, but some
  // tools stream).
  const responseContent = useNodeContent(response ?? call) ?? "";
  const isError = call.isError;
  const hasResponse = !!response;

  // Map the SessionNode tool-call state into Prompt Kit's ToolPart state.
  // - request only, no response → "input-available"
  // - response present, no error → "output-available"
  // - response present, error → "output-error"
  const state: ToolPart["state"] = !hasResponse
    ? "input-available"
    : isError
      ? "output-error"
      : "output-available";

  const toolPart: ToolPart = {
    type: call.toolName,
    state,
    input: asInputRecord(call.args),
    output: hasResponse ? { result: responseContent } : undefined,
    toolCallId: call.callId,
    errorText: hasResponse && isError ? responseContent : undefined,
  };

  return (
    <div className="flex w-full justify-start">
      <div className="w-full max-w-[80%]">
        <Tool toolPart={toolPart} />
      </div>
    </div>
  );
}
