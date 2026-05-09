/**
 * Renderer-fragment init for dock-views. Currently a no-op: the
 * dock-views fragment's React payload is the `<DockViewHost>`
 * component, mounted inside the App tree (App.tsx) when the
 * workspace is open. Mounting the React component is what binds
 * the DockviewApi to the dock fragment's `DockHost` adapter (via
 * `setApi` on `onReady`).
 *
 * This init exists for symmetry with other renderer fragments and
 * to establish the registration point for future additions —
 * e.g. registering custom DockView component kinds for
 * per-fragment renderer extensions, or hooking the bus-trace UI.
 */
export default function initDockViews(
  _ctx: Record<string, unknown>,
): () => void {
  return () => {};
}
