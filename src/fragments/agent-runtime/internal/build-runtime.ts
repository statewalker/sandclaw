import type { ProviderV3 } from "@ai-sdk/provider";
import type { McpServerConfig } from "@statewalker/ai-agent";
import {
  AgentRuntime,
  type SkillInfo,
  type ToolInput,
} from "@statewalker/ai-agent/runtime";
import { createFileTools } from "@statewalker/ai-agent/tools";
import type { FilesApi } from "@statewalker/webrun-files";

const DEFAULT_SYSTEM_FOLDER = "/.settings";

function normalizeSystemPath(folder: string): string {
  const trimmed = folder.replace(/^\/+|\/+$/g, "");
  return `/${trimmed}`;
}

export interface BuildRuntimeInput {
  files: FilesApi;
  systemFolder?: string;
  provider: ProviderV3;
  /** Slot-contributed tools. The fragment also installs the
   * built-in file tools unconditionally (interim until Wave 5.1
   * moves them to `files/`). */
  tools: readonly ToolInput[];
  skills: readonly SkillInfo[];
  /** Already-deduped (last-wins by id). Empty record means no MCP. */
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Pure builder: takes resolved inputs and returns a built
 * `AgentRuntime`. Replaces `services/wire-runtime.ts`. The slot
 * snapshot is materialized at the call site; this function is a
 * one-shot construction with no observation responsibility.
 *
 * `createFileTools` is installed inline. Wave 5.1 will move it into
 * the `files` fragment as an `agent:tools` contribution; this
 * function will then drop the `addTools(createFileTools(...))` line.
 */
export async function buildRuntime(
  input: BuildRuntimeInput,
): Promise<AgentRuntime> {
  const systemPath = normalizeSystemPath(
    input.systemFolder ?? DEFAULT_SYSTEM_FOLDER,
  );
  const runtime = new AgentRuntime({ files: input.files }).setSystemPath(
    systemPath,
  );
  runtime.addModelProvider(input.provider);

  // Built-in file tools (interim; moves to `files/` fragment in W5.1).
  // Empty exclusion list — `setSystemPath` already hides the system
  // subtree from the tools view.
  runtime.addTools((ctx) =>
    createFileTools(ctx.files, { excludedPrefixes: [] }),
  );

  if (input.tools.length > 0) {
    runtime.addTools(...input.tools);
  }
  if (input.skills.length > 0) {
    runtime.addSkills(...input.skills);
  }
  if (Object.keys(input.mcpServers).length > 0) {
    runtime.setMcpServers(input.mcpServers);
  }

  await runtime.build();
  return runtime;
}
