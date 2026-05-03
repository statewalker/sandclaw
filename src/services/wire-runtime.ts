import type { ProviderV3 } from "@ai-sdk/provider";
import { AgentRuntime } from "@statewalker/ai-agent/runtime";
import { createFileTools } from "@statewalker/ai-agent/tools";
import type { FilesApi } from "@statewalker/webrun-files";

export interface WireRuntimeOptions {
  /** System folder under the workspace root, default `.settings`. */
  systemFolder?: string;
}

const DEFAULT_SYSTEM_FOLDER = ".settings";

function normalizeSystemPath(folder: string): string {
  const trimmed = folder.replace(/^\/+|\/+$/g, "");
  return `/${trimmed}`;
}

/**
 * Build an {@link AgentRuntime} bound to the workspace `files` and the given
 * remote model providers. The system path defaults to `.settings`; tools
 * automatically receive a {@link FilesApi} view that hides the system subtree
 * (see ai-agent's `setSystemPath` and `buildToolsView`).
 */
export async function wireRuntime(
  files: FilesApi,
  providers: ProviderV3[],
  options: WireRuntimeOptions = {},
): Promise<AgentRuntime> {
  const systemPath = normalizeSystemPath(
    options.systemFolder ?? DEFAULT_SYSTEM_FOLDER,
  );
  const runtime = new AgentRuntime({ files }).setSystemPath(systemPath);
  for (const provider of providers) {
    runtime.addModelProvider(provider);
  }
  // The system path itself is hidden by AgentRuntime.setSystemPath; pass an
  // empty exclusion list so file tools don't double-filter.
  runtime.addTools((ctx) =>
    createFileTools(ctx.files, { excludedPrefixes: [] }),
  );
  await runtime.build();
  return runtime;
}
