import type { Actions, Components } from "@json-render/react";
import { type DefineRegistryResult, defineRegistry } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";
import { type AiLocalModelsCatalog, aiLocalModelsCatalog } from "./catalog.js";
import { MarkdownText } from "./markdown-text.js";

export interface BuildRegistryOptions {
  /** Action implementations keyed by action name (see action-handlers.ts). */
  actions: Record<string, (params: Record<string, unknown>) => Promise<void>>;
}

/**
 * Build the json-render `Registry` for the local-models catalog by
 * combining the shadcn React bindings with the bespoke `Markdown`
 * primitive. The `actions` map is supplied by the tab host (it closes
 * over workspace adapters / commands).
 */
export function buildAiLocalModelsRegistry(options: BuildRegistryOptions): DefineRegistryResult {
  const components = {
    ...shadcnComponents,
    Markdown: MarkdownText,
  } as unknown as Components<AiLocalModelsCatalog>;
  const actions = options.actions as unknown as Actions<AiLocalModelsCatalog>;
  return defineRegistry(aiLocalModelsCatalog, { components, actions });
}
