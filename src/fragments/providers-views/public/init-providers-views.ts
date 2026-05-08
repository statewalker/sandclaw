import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import { ViewRegistry } from "@/fragments/core-views";
import { PROVIDERS_SETTINGS_TAB_VIEW_KEY } from "@/fragments/providers";
import { ProviderConfigPanel } from "../internal/provider-config-panel.js";

/**
 * Renderer-fragment init for the providers UI. Pairs with
 * `@/fragments/providers` (logic).
 *
 * Wave 4.3 binds the React `<ProviderConfigPanel>` to the viewKey
 * the providers logic fragment contributes to `settings:tabs`. The
 * settings dialog renders the panel inside its left-rail layout
 * via `ViewRegistry.get(viewKey)` (slot pattern C).
 */
export function initProvidersViews(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const registry = workspace.requireAdapter(ViewRegistry);

  const [register, cleanup] = newRegistry();
  register(
    registry.register(
      PROVIDERS_SETTINGS_TAB_VIEW_KEY,
      ProviderConfigPanel as unknown as Parameters<typeof registry.register>[1],
    ),
  );
  return cleanup;
}
