/**
 * Renderer-fragment init for `settings-views`. The dialog and
 * button are exported as direct React components — there's nothing
 * to register at boot. Future viewKey wiring (settings-tab
 * defaults, json-render catalog binding) lands here when needed.
 */
export default function initSettingsViews(
  _ctx: Record<string, unknown>,
): () => void {
  return () => {
    /* no-op */
  };
}
