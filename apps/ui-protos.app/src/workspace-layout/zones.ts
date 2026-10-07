// The layout contract a plugin sees: each panel names the zones it prefers, in
// order; presets say which zones exist and how big they are. The functions
// here are the only code that maps zones onto dockview positions.
import type { DockviewApi, DockviewGroupPanel, SerializedDockview } from "dockview-react";

export type Zone = "left" | "center" | "right" | "bottom";

/** One panel contributed by an installed plugin. */
export interface PanelContribution {
  id: string;
  title: string;
  /** Key into the dock's component map. */
  component: string;
  /**
   * Zones the panel goes to, most preferred first. The panel is placed in the
   * first one the layout has. Empty: never placed automatically; the user
   * opens it, and it lands in the last active dock group.
   */
  targets: Zone[];
}

/**
 * A layout preset: the zones it has and their sizes. The center always
 * exists. A preset saved by the user would add a dockview snapshot here.
 */
export interface Preset {
  id: string;
  label: string;
  zones: Partial<Record<Exclude<Zone, "center">, { size: number }>>;
}

const order: Zone[] = ["center", "left", "right", "bottom"];
const direction = { left: "left", right: "right", bottom: "below" } as const;

function zoneOf(group: DockviewGroupPanel): Zone | undefined {
  return (group.panels[0]?.params as { zone?: Zone } | undefined)?.zone;
}

/** The last panel already in `zone`, to stack or tab the next one against. */
function lastIn(api: DockviewApi, zone: Zone): string | undefined {
  return api.panels.filter((p) => (p.params as { zone?: Zone })?.zone === zone).at(-1)?.id;
}

function addToZone(api: DockviewApi, panel: PanelContribution, zone: Zone): void {
  const base = { id: panel.id, title: panel.title, component: panel.component, params: { zone } };
  const last = lastIn(api, zone);
  if (!last) {
    // A new zone: center fills the dock; the others open at the dock's edges.
    if (zone === "center" || api.panels.length === 0) api.addPanel(base);
    else api.addPanel({ ...base, position: { direction: direction[zone] } });
  } else if (zone === "left" || zone === "right") {
    // Side zones stack their panels, so a locked zone needs no tab strip.
    api.addPanel({ ...base, position: { referencePanel: last, direction: "below" } });
  } else {
    api.addPanel({ ...base, position: { referencePanel: last }, inactive: true });
  }
}

/** Lays out `preset` from scratch with every installed panel that has a target zone in it. */
export function applyPreset(
  api: DockviewApi,
  preset: Preset,
  installed: PanelContribution[],
): void {
  api.clear();
  const has = (z: Zone) => z === "center" || z in preset.zones;
  const placed = new Map<Zone, PanelContribution[]>();
  for (const panel of installed) {
    const zone = panel.targets.find(has);
    if (zone) placed.set(zone, [...(placed.get(zone) ?? []), panel]);
  }
  // Center first, then the side zones at the dock's edges (full height), then
  // the bottom zone below everything (full width).
  for (const zone of order) {
    for (const panel of placed.get(zone) ?? []) addToZone(api, panel, zone);
  }
  // Sizes go last: dockview rebalances earlier sizes as each zone is added.
  const groupOf = (zone: Zone) => {
    const id = placed.get(zone)?.[0]?.id;
    return id ? api.getPanel(id)?.group.api : undefined;
  };
  for (const zone of ["left", "right"] as const) {
    const size = preset.zones[zone]?.size;
    if (size) groupOf(zone)?.setSize({ width: size });
  }
  const bottom = preset.zones.bottom?.size;
  const strip = groupOf("bottom");
  if (bottom && strip) {
    strip.setConstraints({ minimumHeight: STRIP_MIN_HEIGHT });
    strip.setSize({ height: bottom });
  }
}

/**
 * Places a newly installed panel in the first of its target zones that the
 * current layout has. Returns false when there is none: the user opens it.
 */
export function placePanel(api: DockviewApi, panel: PanelContribution): boolean {
  const present = new Set(api.groups.map(zoneOf));
  const zone = panel.targets.find((z) => present.has(z));
  if (!zone) return false;
  addToZone(api, panel, zone);
  return true;
}

/** Opens a panel the user asked for, as a tab in the last active group. */
export function openPanel(api: DockviewApi, panel: PanelContribution): void {
  const group = api.activeGroup ?? api.groups[0];
  const zone = (group && zoneOf(group)) ?? "center";
  const base = { id: panel.id, title: panel.title, component: panel.component, params: { zone } };
  api.addPanel(group ? { ...base, position: { referenceGroup: group } } : base);
}

/**
 * Restores a saved layout, repairing it: panels whose plugin is no longer
 * installed are removed and the rest of the arrangement is kept. Returns the
 * ids of the removed panels.
 */
export function restoreLayout(
  api: DockviewApi,
  layout: SerializedDockview,
  installed: PanelContribution[],
  placeholder: string,
): string[] {
  const known = new Set(installed.map((p) => p.component));
  const removed: string[] = [];
  const panels = Object.fromEntries(
    Object.entries(layout.panels).map(([id, p]) => {
      if (p.contentComponent && known.has(p.contentComponent)) return [id, p];
      removed.push(id);
      // Dockview cannot load a panel whose component is unknown, so it is
      // loaded as a placeholder and removed right after.
      return [id, { ...p, contentComponent: placeholder }];
    }),
  );
  api.fromJSON({ ...layout, panels });
  for (const id of removed) {
    const panel = api.getPanel(id);
    if (panel) api.removePanel(panel);
  }
  return removed;
}

/**
 * How a single-panel side zone shows its tab strip: `hidden` (locked layout),
 * `hover` (shown while the pointer is over the zone, so it can be dragged), or
 * `visible`. The center always keeps its document tabs.
 */
export type ZoneHeaders = "hidden" | "hover" | "visible";

/** Dockview's default minimum group height (100px) is too tall for the bottom strip. */
const STRIP_MIN_HEIGHT = 32;

/**
 * Brings the dock back in line with the zone model after any change (a drag,
 * a restore, a new panel). Run it on every layout change:
 * - a panel moved into a group takes that group's zone, so later placements
 *   find the zone where the user put things;
 * - side-zone tab strips follow `headers`;
 * - the bottom zone gets its low minimum height back (dockview does not save
 *   size constraints in a layout snapshot).
 */
export function syncZones(api: DockviewApi, headers: ZoneHeaders): void {
  for (const group of api.groups) {
    const zone = zoneOf(group);
    for (const panel of group.panels) {
      if (zone && (panel.params as { zone?: Zone } | undefined)?.zone !== zone) {
        panel.api.updateParameters({ zone });
      }
    }
    const side = zone !== "center" && group.panels.length === 1;
    const hidden = side && headers === "hidden";
    // Each change below fires another layout change, which runs this again:
    // touch only what differs, or the two keep triggering each other.
    if (group.header.hidden !== hidden) group.header.hidden = hidden;
    group.element.classList.toggle("sc-zone-hover", side && headers === "hover");
    if (zone === "bottom" && group.minimumHeight !== STRIP_MIN_HEIGHT) {
      group.api.setConstraints({ minimumHeight: STRIP_MIN_HEIGHT });
    }
  }
}
