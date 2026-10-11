// The layout contract a plugin sees: each panel names the zones it prefers, in
// order; layouts say which zones exist and how big they are. The functions
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
 * A predefined layout: the zones it has and their sizes. The center always
 * exists. A layout saved by the user would add a dockview snapshot here.
 */
export interface Layout {
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

/** Lays out `layout` from scratch with every installed panel that has a target zone in it. */
export function applyLayout(
  api: DockviewApi,
  layout: Layout,
  installed: PanelContribution[],
): void {
  api.clear();
  const has = (z: Zone) => z === "center" || z in layout.zones;
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
    const size = layout.zones[zone]?.size;
    if (size) groupOf(zone)?.setSize({ width: size });
  }
  const bottom = layout.zones.bottom?.size;
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
export function loadSavedLayout(
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
 * How a side zone shows its tab strip: `hidden` (the zone is fixed), `hover`
 * (shown while the pointer is over the zone, so it can be dragged), or
 * `visible`. The center always keeps its document tabs.
 */
export type ZoneHeaders = "hidden" | "hover" | "visible";

/** Dockview's default minimum group height (100px) is too tall for the bottom strip. */
const STRIP_MIN_HEIGHT = 32;

/**
 * A fixed dock: nothing can be dropped into it (`locked: "no-drop-target"`), and
 * the workspace vetoes drags that start in it (see `vetoDragsFromFixedDocks`).
 * Dockview's own lock only covers drops, so the drag veto is the other half.
 */
export function isFixed(group: DockviewGroupPanel): boolean {
  return group.locked === "no-drop-target";
}

/**
 * Cancels every drag that starts in a fixed dock: a tab (`onWillDragPanel`) or
 * the whole dock (`onWillDragGroup`). Dockview's HTML5 backend skips a drag whose
 * native event was default-prevented. Returns the disposers.
 */
export function vetoDragsFromFixedDocks(api: DockviewApi): Array<{ dispose(): void }> {
  return [
    api.onWillDragPanel((e) => {
      if (e.panel.group && isFixed(e.panel.group)) e.nativeEvent.preventDefault();
    }),
    api.onWillDragGroup((e) => {
      if (isFixed(e.group)) e.nativeEvent.preventDefault();
    }),
  ];
}

/**
 * Brings the dock back in line with the zone model after any change (a drag,
 * a restore, a new panel). Run it on every layout change:
 * - a panel moved into a group takes that group's zone, so later placements
 *   find the zone where the user put things;
 * - each side zone follows `headersFor(zone)`: `hidden` makes its docks fixed
 *   (no drops in, no drags out) and hides a single panel's tab strip; a fixed
 *   dock holding several tabs keeps its strip so the tabs can still be switched;
 * - the bottom zone gets its low minimum height back (dockview does not save
 *   size constraints in a layout snapshot).
 */
export function syncZones(api: DockviewApi, headersFor: (zone: Zone) => ZoneHeaders): void {
  for (const group of api.groups) {
    const zone = zoneOf(group);
    for (const panel of group.panels) {
      if (zone && (panel.params as { zone?: Zone } | undefined)?.zone !== zone) {
        panel.api.updateParameters({ zone });
      }
    }
    const headers = zone && zone !== "center" ? headersFor(zone) : "visible";
    const fixed = headers === "hidden";
    const single = group.panels.length === 1;
    const locked = fixed ? "no-drop-target" : false;
    // Each change below fires another layout change, which runs this again:
    // touch only what differs, or the two keep triggering each other.
    if (group.locked !== locked) group.locked = locked;
    if (group.header.hidden !== (fixed && single)) group.header.hidden = fixed && single;
    group.element.classList.toggle("sc-zone-hover", single && headers === "hover");
    if (zone === "bottom" && group.minimumHeight !== STRIP_MIN_HEIGHT) {
      group.api.setConstraints({ minimumHeight: STRIP_MIN_HEIGHT });
    }
  }
}

/**
 * Keeps the side bars' sizes when docks are moved, split, merged or closed; the
 * center takes whatever space is left.
 *
 * Why it is needed: when a dock is removed (a tab dragged out of a split, the
 * last tab closed) dockview spreads the freed space evenly over every sibling
 * (`gridview.remove(group, Sizing.Distribute)`), so the left and right bars grow.
 *
 * Only the size that is the bar's own is kept: the width of a left or right
 * bar, the height of the bottom bar. The other dimension is shared with the
 * rest of the row or column, and forcing it pushes the whole grid around.
 *
 * How: those sizes are remembered while the layout is stable
 * (a resize with a splitter is remembered too). Remembering pauses while a drag
 * is in flight, and the remembered sizes are put back after a drop, a dock added
 * or removed, or a panel moved — once the layout has settled: dockview re-lays
 * the grid out proportionally over several layout passes, and a size set in the
 * middle of them is scaled away. A dock dragged as a whole is not restored: it
 * takes the size of its new place. Returns a function that stops it.
 */
export function keepSideSizes(api: DockviewApi): () => void {
  let remembered = new Map<string, number>();
  let dragging = false;
  let pending = false;
  let movedDock: string | undefined;
  let frame = 0;
  // The bar's own size: width across a left/right bar, height across the bottom bar.
  const ownSize = (group: DockviewGroupPanel): "width" | "height" | undefined => {
    const zone = zoneOf(group);
    if (zone === "left" || zone === "right") return "width";
    if (zone === "bottom") return "height";
    return undefined;
  };
  const remember = () => {
    remembered = new Map();
    for (const group of api.groups) {
      const dimension = ownSize(group);
      if (dimension) remembered.set(group.id, group[dimension]);
    }
  };
  const restore = () => {
    frame = 0;
    pending = false;
    for (const group of api.groups) {
      const size = remembered.get(group.id);
      const dimension = ownSize(group);
      if (size === undefined || !dimension || group.id === movedDock) continue;
      if (Math.abs(group[dimension] - size) > 1) group.api.setSize({ [dimension]: size });
    }
    movedDock = undefined;
    remember();
  };
  // Debounced to two frames after the last layout pass: when a dock is dropped on
  // the window's edge, dockview builds a new outer row and finishes sizing it a
  // frame after its last layout event; a size set before that is scaled away.
  const settle = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(restore);
    });
  };
  const schedule = () => {
    pending = true;
    settle();
  };
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    schedule();
  };
  const subscriptions = [
    api.onWillDragPanel(() => {
      dragging = true;
    }),
    api.onWillDragGroup((e) => {
      dragging = true;
      movedDock = e.group.id;
    }),
    api.onDidAddGroup(schedule),
    api.onDidRemoveGroup(schedule),
    api.onDidMovePanel(schedule),
    // Deferred: a structural change fires its own event in the same call stack,
    // and that scheduled restore must win over remembering the spread sizes.
    api.onDidLayoutChange(() => {
      if (pending) settle();
      queueMicrotask(() => {
        if (!dragging && !pending) remember();
      });
    }),
  ];
  // An HTML5 drag ends with `drop` (when something was dropped) or `dragend` (when it
  // was cancelled). `dragend` alone is not enough: it fires on the dragged element,
  // which a dock move has already detached from the page, so it never reaches the
  // document. Dockview's pointer drag (touch) ends with `pointerup`.
  const endEvents = ["drop", "dragend", "pointerup"] as const;
  for (const type of endEvents) document.addEventListener(type, endDrag, true);
  remember();
  return () => {
    for (const s of subscriptions) s.dispose();
    for (const type of endEvents) document.removeEventListener(type, endDrag, true);
    cancelAnimationFrame(frame);
  };
}
