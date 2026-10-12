// How the App's views go onto the dock. The file panels are placed by
// `useFilesInDock`; these functions place the App views around them.
import type { DockviewApi, IDockviewPanel } from "dockview-react";
import type { Zone } from "../../workspace-layout/zones.js";
import type { AppLayoutId, AppView } from "../contracts.js";

/** The dock component every App view renders through; it finds the view by panel id. */
export const VIEW = "app-view";
/** Each side zone's size when a mode is laid out from scratch. */
export const SIDE_SIZES = { left: 260, right: 360, bottom: 48 } as const;
/** Dockview's default minimum group height (100px) is too tall for the bottom strip. */
const STRIP_MIN_HEIGHT = 32;
const EDGE = { left: "left", right: "right", bottom: "below" } as const;

export const byActivity = (a: AppView, b: AppView) => (a.activity ?? 0) - (b.activity ?? 0);

export const zoneOfPanel = (panel: IDockviewPanel): Zone =>
  (panel.params as { zone?: Zone } | undefined)?.zone ?? "center";

const panelOf = (view: AppView) => ({
  id: view.id,
  title: view.title,
  component: VIEW,
  params: { zone: view.zone },
});

/**
 * The views a dock mode starts with: the activity views on the left, the
 * right and bottom views in the Assistant layout. Center views open on
 * demand; the compact mode keeps left and right views as overlays.
 */
export function startingViews(views: AppView[], layout: AppLayoutId, compact: boolean): AppView[] {
  return views.filter((v) => {
    if (v.zone === "left") return !compact && v.activity !== undefined;
    if (v.zone === "right") return !compact && layout === "assistant";
    if (v.zone === "bottom") return layout === "assistant";
    return false;
  });
}

/**
 * Adds the side zones around what the dock already holds (the file panels):
 * each zone's views as tabs of one group at that edge, the bottom one last so
 * it spans the full width; then the sizes, which dockview would rebalance if
 * set while zones are still being added.
 */
export function layoutSides(api: DockviewApi, views: AppView[]): void {
  const zones = ["left", "right", "bottom"] as const;
  for (const zone of zones) {
    const [first, ...rest] = views.filter((v) => v.zone === zone).sort(byActivity);
    if (!first) continue;
    api.addPanel({ ...panelOf(first), position: { direction: EDGE[zone] } });
    for (const v of rest) {
      api.addPanel({ ...panelOf(v), position: { referencePanel: first.id }, inactive: true });
    }
  }
  for (const zone of zones) {
    const first = views.filter((v) => v.zone === zone).sort(byActivity)[0];
    const group = first && api.getPanel(first.id)?.group.api;
    if (!group) continue;
    if (zone === "bottom") {
      group.setConstraints({ minimumHeight: STRIP_MIN_HEIGHT });
      group.setSize({ height: SIDE_SIZES.bottom });
    } else group.setSize({ width: SIDE_SIZES[zone] });
  }
}

/**
 * Opens `view`, or brings it forward where it is (a hidden group shows again).
 * A center view goes beside the active center panel; with no center panel
 * left, right of the left bar (or left of the right bar), never inside them.
 */
export function showView(api: DockviewApi, view: AppView): void {
  const open = api.getPanel(view.id);
  if (open) {
    open.group.api.setVisible(true);
    open.api.setActive();
    return;
  }
  const inZone = (zone: Zone) => api.panels.find((p) => zoneOfPanel(p) === zone);
  if (view.zone !== "center") {
    const near = inZone(view.zone);
    if (near) api.addPanel({ ...panelOf(view), position: { referencePanel: near.id } });
    else api.addPanel({ ...panelOf(view), position: { direction: EDGE[view.zone] } });
    return;
  }
  const active = api.activePanel;
  const center = active && zoneOfPanel(active) === "center" ? active : inZone("center");
  const left = inZone("left");
  const right = inZone("right");
  if (center) api.addPanel({ ...panelOf(view), position: { referencePanel: center.id } });
  else if (left) {
    api.addPanel({ ...panelOf(view), position: { referencePanel: left.id, direction: "right" } });
  } else if (right) {
    api.addPanel({ ...panelOf(view), position: { referencePanel: right.id, direction: "left" } });
  } else api.addPanel(panelOf(view));
}

/** On for the activity bar: in the left zone, the active tab of a visible group. */
export function isShownLeft(api: DockviewApi, id: string): boolean {
  const panel = api.getPanel(id);
  return (
    !!panel &&
    zoneOfPanel(panel) === "left" &&
    panel.group.api.isVisible &&
    panel.group.activePanel?.id === id
  );
}

/** The activity bar's click: hides the left bar when the view is already shown there. */
export function toggleLeft(api: DockviewApi, view: AppView): void {
  const panel = api.getPanel(view.id);
  if (panel && isShownLeft(api, view.id)) panel.group.api.setVisible(false);
  else showView(api, view);
}
