import {
  FILE_EXPLORER_CATALOG_ID,
  type FileExplorerPanelPreset,
  fileExplorerPanelId,
  fileExplorerPanelPresetsSlot,
  fileExplorerSpecId,
  makeFileExplorerSpec,
  NewFileExplorerPanelCommand,
} from "@statewalker/explorer.core";
import {
  catalogsSlot,
  LayoutStore,
  restorePanelSpecsFromLayout,
  SpecStore,
} from "@statewalker/render.core";
import { defineRegistry } from "@statewalker/render.view.react";
import { Commands } from "@statewalker/shared-commands";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { type PanelPosition, ShowDockPanelCommand } from "@statewalker/shell.core";
import { dockTabIconSlot } from "@statewalker/shell.view.react";
import { compareByOrderAndId } from "@statewalker/ui.view.react";
import { getWorkspace } from "@statewalker/workspace.core";
import { FolderOpen } from "lucide-react";
import { FileExplorerPanel } from "../internal/file-explorer-panel.js";
import { fileExplorerCatalog } from "./catalog.js";

/**
 * Renderer-fragment init for `@statewalker/file-explorer-react`.
 *
 * Concerns:
 *   1. **Catalog binding** — registers `FileExplorerView` (the React
 *      view that owns the panel's `PanelController` + `FilesListView`)
 *      against the `file-explorer` json-render catalog so dock tabs
 *      built from `makeFileExplorerSpec` resolve correctly.
 *   2. **Two-pane preset application** — when the workspace opens,
 *      reads the `file-explorer:panels` slot and dispatches one
 *      `dock:show-panel` per preset. Each panel becomes a regular dock
 *      tab in the central `DockViewHost`, mirroring how every other
 *      viewer (markdown, pdf, image, video) appears.
 *
 * The `side` field on a preset is interpreted as a dock-position hint:
 *   - the first preset opens at default position (a fresh group);
 *   - subsequent `side: "left"` / `"right"` presets create a split
 *     group on that side of the previous panel;
 *   - `side: "main"` (or unset) docks `"within"` the previous panel as
 *     an additional tab.
 */
export default function initFileExplorerReact(ctx: Record<string, unknown>): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const commands = workspace.requireAdapter(Commands);
  const store = workspace.requireAdapter(SpecStore);
  const slots = workspace.requireAdapter(Slots);
  const layoutStore = workspace.requireAdapter(LayoutStore);

  const [register, cleanup] = newRegistry();

  // ── Pre-allocate specs for restored tabs ──────────────────────
  // On workspace-connect, pre-allocate a spec for every persisted
  // file-explorer panel id in the restored layout (held by the
  // LayoutStore adapter), so DockHost's deferred fromJSON() finds a
  // spec instead of flashing the `PanelMissing` placeholder. Registered
  // before the preset onLoad below so pre-allocs precede preset upgrades.
  register(
    workspace.onLoad(() => {
      restorePanelSpecsFromLayout({
        store,
        layout: layoutStore.get(),
        panelIdPrefix: "file-explorer:",
        catalogId: FILE_EXPLORER_CATALOG_ID,
        buildSpec: (id) => makeFileExplorerSpec(id),
        buildSpecId: (id) => fileExplorerSpecId(id),
      });
    }),
  );

  // ── Catalog binding ───────────────────────────────────────────
  const { registry } = defineRegistry(fileExplorerCatalog, {
    components: {
      FileExplorerView: ({ props }) => (
        <FileExplorerPanel
          panelId={props.panelId}
          label={props.label}
          initialPath={props.initialPath}
          mainViewerHost={props.mainViewerHost}
          folderNavigationHost={props.folderNavigationHost}
        />
      ),
    },
    actions: {},
  });
  register(slots.register(catalogsSlot, FILE_EXPLORER_CATALOG_ID, registry));

  register(slots.provide(dockTabIconSlot, { panelIdPrefix: "file-explorer:", Icon: FolderOpen }));

  // ── Two-pane preset application ───────────────────────────────
  const opened = new Set<string>();

  async function applyPresets(presets: readonly FileExplorerPanelPreset[]): Promise<void> {
    const sorted = [...presets].sort(compareByOrderAndId);
    for (let i = 0; i < sorted.length; i++) {
      const preset = sorted[i];
      if (!preset || opened.has(preset.id)) continue;

      const specId = fileExplorerSpecId(preset.id);
      const presetSpec = makeFileExplorerSpec(preset.id, {
        label: preset.label,
        initialPath: preset.initialPath,
        mainViewerHost: preset.mainViewerHost,
        folderNavigationHost: preset.folderNavigationHost,
      });
      if (!store.get(specId)) {
        store.create({
          id: specId,
          catalogId: FILE_EXPLORER_CATALOG_ID,
          spec: presetSpec,
          meta: { persistent: true },
        });
      } else {
        // A spec may already exist when `restorePanelSpecsFromLayout`
        // pre-allocated a default for a persisted layout. Upgrade it
        // with the full preset (label, host flags, …) so the rendered
        // panel matches the canonical layout instead of running with
        // the layout-restore defaults.
        store.patch(specId, { spec: presetSpec });
      }

      const position = i === 0 ? undefined : sidePosition(preset.side);
      try {
        await commands.call(ShowDockPanelCommand, {
          panelId: fileExplorerPanelId(preset.id),
          specId,
          position,
          title: preset.label,
        }).promise;
        opened.add(preset.id);
      } catch (err) {
        console.error("[file-explorer] failed to open dock panel:", preset.id, err);
      }
    }
  }

  function applyOnLoad(): void {
    void applyPresets(slots.getSnapshot(fileExplorerPanelPresetsSlot));
  }

  // `workspace.onLoad` fires the callback immediately if already
  // opened, so a single subscription covers both first-load and
  // subsequent open() cycles.
  register(workspace.onLoad(applyOnLoad));

  register(
    slots.observe(fileExplorerPanelPresetsSlot, () => {
      // Hot-added presets are applied opportunistically; opened panels
      // are tracked in `opened` so existing tabs aren't duplicated.
      if (workspace.isOpened) applyOnLoad();
    }),
  );

  register(workspace.onUnload(() => opened.clear()));

  // ── New-panel command ──────────────────────────────────────────
  // Lets users (via the toolbar button or any caller) spin up a
  // fresh file-explorer tab on demand. Each invocation produces a
  // new id so the tab is independent of any existing panel.
  register(
    commands.listen(NewFileExplorerPanelCommand, (command) => {
      const id = `panel-${crypto.randomUUID().slice(0, 8)}`;
      const specId = fileExplorerSpecId(id);
      const label = command.payload.label ?? "Files";
      store.create({
        id: specId,
        catalogId: FILE_EXPLORER_CATALOG_ID,
        spec: makeFileExplorerSpec(id, {
          label,
          initialPath: command.payload.initialPath,
        }),
        meta: { persistent: true },
      });
      commands
        .call(ShowDockPanelCommand, {
          panelId: fileExplorerPanelId(id),
          specId,
          title: label,
          position: command.payload.position ?? "within",
        })
        .promise.then(() => command.resolve({ panelId: id }))
        .catch((err) => command.reject(err));
      return true;
    }),
  );

  return cleanup;
}

function sidePosition(side: FileExplorerPanelPreset["side"]): PanelPosition {
  if (side === "left" || side === "right") return side;
  return "within";
}
