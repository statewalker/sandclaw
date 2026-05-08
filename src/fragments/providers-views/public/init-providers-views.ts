/**
 * Renderer-fragment init for the providers UI. Pairs with
 * `@/fragments/providers` (logic).
 *
 * Wave 4.2 leaves the existing dialog/gate/picker components as
 * directly-imported React components — chat-mini's shell still
 * references them by name (`<ProviderSettingsDialog />`,
 * `<ProviderConfigGate />`). The slot-driven settings:tabs +
 * chat:composer-actions integrations land in Waves 4.3 and 7.1
 * respectively; at that point this init starts registering view
 * keys and binding json-render catalog types.
 */
export function initProvidersViews(_ctx: Record<string, unknown>): () => void {
  return () => {
    /* no-op until Wave 4.3 / 7.1 */
  };
}
