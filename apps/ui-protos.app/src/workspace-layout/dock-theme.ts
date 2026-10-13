import type { DockviewTheme } from "dockview-react";

/**
 * The docks' theme: dockview's light base under the shadcn tokens of `workspace.css`. Passed as
 * `theme`, not only as a class: without it dockview puts its dark default theme on its own shell,
 * and that theme's colours win inside the shell, e.g. in the list of tabs that don't fit.
 */
export const DOCK_THEME: DockviewTheme = {
  name: "sandclaw",
  className: "dockview-theme-light dockview-theme-sandclaw",
};
