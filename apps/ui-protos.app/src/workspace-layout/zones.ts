// The layout contract a plugin sees: it contributes a panel to a named zone,
// and presets arrange those panels. Plugins never touch dockview positions;
// `applyPreset` is the only place that maps zones onto the dock.
import type { DockviewApi, SerializedDockview } from "dockview-react";

export type Zone = "left" | "center" | "right" | "bottom";

/** One panel contributed by an installed plugin. */
export interface PanelContribution {
  id: string;
  title: string;
  /** Key into the dock's component map. */
  component: string;
  /** Where the panel goes when a preset does not say otherwise. */
  zone: Zone;
}

/** A named arrangement: which panels sit in which zone, and the zone sizes. */
export interface Preset {
  id: string;
  label: string;
  zones: Partial<Record<Zone, string[]>>;
  sizes?: { left?: number; right?: number; bottom?: number };
}

const direction = { left: "left", right: "right", bottom: "below" } as const;

/**
 * Lays out `preset` from scratch. Panels whose plugin is not installed are
 * skipped and returned, so the shell can say what it left out.
 */
export function applyPreset(
  api: DockviewApi,
  preset: Preset,
  installed: PanelContribution[],
): string[] {
  const byId = new Map(installed.map((p) => [p.id, p]));
  const missing: string[] = [];
  api.clear();
  // Center first, then the side zones at the root's edges (full height), then
  // the bottom zone below everything (full width).
  const firstOf: Partial<Record<Zone, string>> = {};
  for (const zone of ["center", "left", "right", "bottom"] as const) {
    let first: string | undefined;
    let previous: string | undefined;
    for (const id of preset.zones[zone] ?? []) {
      const panel = byId.get(id);
      if (!panel) {
        missing.push(id);
        continue;
      }
      const base = { id, title: panel.title, component: panel.component, params: { zone } };
      if (previous && (zone === "left" || zone === "right")) {
        // Side zones stack their panels, so a locked zone needs no tab strip.
        api.addPanel({ ...base, position: { referencePanel: previous, direction: "below" } });
      } else if (first) {
        api.addPanel({ ...base, position: { referencePanel: first }, inactive: true });
      } else if (zone === "center" || api.panels.length === 0) {
        api.addPanel(base);
      } else {
        api.addPanel({
          ...base,
          position: { direction: direction[zone] },
        });
      }
      first ??= id;
      previous = id;
    }
    if (first) firstOf[zone] = first;
  }
  // Sizes go last: dockview rebalances earlier sizes as each zone is added.
  for (const zone of ["left", "right"] as const) {
    const width = preset.sizes?.[zone];
    const id = firstOf[zone];
    if (width && id) api.getPanel(id)?.group.api.setSize({ width });
  }
  const bottom = firstOf.bottom;
  if (preset.sizes?.bottom && bottom) {
    const strip = api.getPanel(bottom)?.group.api;
    // Dockview's default minimum group height (100px) is too tall for a status strip.
    strip?.setConstraints({ minimumHeight: preset.sizes.bottom });
    strip?.setSize({ height: preset.sizes.bottom });
  }
  return missing;
}

/**
 * A saved layout can be restored only when every panel it names is still
 * installed; otherwise the shell falls back to the preset.
 */
export function canRestore(layout: SerializedDockview, installed: PanelContribution[]): boolean {
  const known = new Set(installed.map((p) => p.component));
  return Object.values(layout.panels).every(
    (p) => p.contentComponent !== undefined && known.has(p.contentComponent),
  );
}

/**
 * Locked: no drag and drop (set on the dock), and the side zones lose their tab
 * strip so they read as fixed areas. The center keeps its document tabs.
 */
export function setZoneHeaders(api: DockviewApi, locked: boolean): void {
  for (const group of api.groups) {
    const zones = group.panels.map((p) => (p.params as { zone?: Zone } | undefined)?.zone);
    const side = zones.every((z) => z !== "center") && group.panels.length === 1;
    group.header.hidden = locked && side;
  }
}
