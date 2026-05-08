/**
 * Renderer-fragment init for workspace-bridge-views (per ADR 0002).
 * Currently a no-op: the renderer fragment's React payload is the
 * `<AppWorkspaceProvider>` and `useAppWorkspace`/`useAdapter`
 * hooks (mounted by App.tsx). Future home for the
 * `<DirectoryPickerEmptyState>` named mount-point that App.tsx
 * renders when `workspace.state === "closed"`.
 */
export function initWorkspaceBridgeViews(
  _ctx: Record<string, unknown>,
): () => void {
  return () => {};
}
