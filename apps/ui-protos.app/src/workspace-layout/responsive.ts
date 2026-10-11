// The workspace's layout modes. A mode is chosen from the width of the
// workspace's own container, not the viewport, so it also behaves when the
// workspace is embedded (an iframe, a split view, a Storybook canvas).

export type Mode = "desktop" | "compact" | "mobile";

/** Below this width: one panel at a time, no dock. */
export const MOBILE_MAX = 640;
/** Below this width (and at least MOBILE_MAX): the side bars become overlays. */
export const COMPACT_MAX = 1024;

export function modeFor(width: number): Mode {
  if (width < MOBILE_MAX) return "mobile";
  if (width < COMPACT_MAX) return "compact";
  return "desktop";
}

/** The modes rendered with the dock; mobile renders a stack instead. */
export function usesDock(mode: Mode): boolean {
  return mode !== "mobile";
}
