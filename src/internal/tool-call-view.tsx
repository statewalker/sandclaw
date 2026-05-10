import type { ToolCall } from "@statewalker/ai-agent/state";
import type { ReactElement } from "react";
import { useNodeChildren, useNodeContent } from "./hooks/use-session-node.js";
import { Tool, type ToolPart } from "./prompt-kit/tool.js";

function asInputRecord(args: unknown): Record<string, unknown> | undefined {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  if (args === undefined) return undefined;
  // Wrap non-object args so the Tool component's keyed renderer can show them.
  return { value: args };
}

/**
 * Parse a tool's response payload for the prompt-kit `Tool` output
 * area. The Tool component formats objects via `JSON.stringify(v,
 * null, 2)`, so passing the parsed structure (rather than the raw
 * JSON text) yields the pretty-printed view consumers expect.
 *
 * - Empty / missing → undefined (Tool hides the output section).
 * - JSON object → returned as-is.
 * - JSON array / primitive → wrapped under `result` (Tool's output
 *   prop is `Record<string, unknown>`, so a top-level non-object
 *   needs a key).
 * - Non-JSON string → wrapped under `result` so it still renders
 *   verbatim in the output pre.
 */
function parseOutput(text: string): Record<string, unknown> | undefined {
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { result: parsed };
  } catch {
    return { result: text };
  }
}

export function ToolCallView({ call }: { call: ToolCall }): ReactElement {
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
    output: hasResponse && !isError ? parseOutput(responseContent) : undefined,
    toolCallId: call.callId,
    errorText: hasResponse && isError ? responseContent : undefined,
  };

  return (
    <div className="w-full max-w-2xl">
      <Tool toolPart={toolPart} />
    </div>
  );
}
