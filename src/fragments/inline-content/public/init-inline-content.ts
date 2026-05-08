import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import { InlineContentRegistry } from "../internal/inline-content-registry.js";

/**
 * Logic-fragment init for `inline-content`. Eagerly attaches the
 * `InlineContentRegistry` adapter so consumers don't race the
 * lazy adapter creation — same shape as `initCatalogRegistry`.
 *
 * Boot order: register BEFORE the renderer fragments that
 * contribute components.
 */
export function initInlineContent(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  workspace.requireAdapter(InlineContentRegistry);
  return cleanup;
}
