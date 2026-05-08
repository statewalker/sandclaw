import type { DockviewApi } from "dockview-react";
import type { ShowDockPanelPayload } from "./intents.js";

const LAYOUT_KEY = "chat-mini:dock-layout";

interface PendingPanel {
  options: ShowDockPanelPayload;
  /** Resolves after the panel is actually opened (after the api comes online). */
  resolve: () => void;
}

/**
 * Workspace adapter holding the active `DockviewApi` reference plus a
 * queue of `runShowDockPanel` calls that fired before the
 * `<DockviewReact>` host mounted.
 *
 * The dock fragment's `init` runs during boot, so the intent
 * handlers it registers are reachable immediately. The
 * `<DockviewReact>` component, however, only mounts inside the
 * React tree (via the renderer fragment's DockViewHost). Any
 * `runShowDockPanel` call between those two events is queued; the
 * queue drains synchronously on `setApi`. After the api is set,
 * calls are dispatched directly.
 *
 * Layout persistence is currently localStorage-keyed; this moves
 * to `SystemFiles/dock-layout.json` once the workspace lifecycle
 * (ADR 0001) is wired up by `workspace-bridge` (Wave 3).
 */
export class DockHost {
  private _api: DockviewApi | null = null;
  private _pending: PendingPanel[] = [];
  private _layoutSaveScheduled = false;
  private _disposeApiListeners: (() => void) | null = null;
  private _activeListeners = new Set<(panelId: string | undefined) => void>();
  private _activePanelId: string | undefined = undefined;
  private _layoutListeners = new Set<() => void>();

  declare init?: () => void | Promise<void>;
  declare close?: () => void | Promise<void>;

  setApi(api: DockviewApi): void {
    if (this._api === api) return;
    this._disposeApiListeners?.();
    this._api = api;
    // Restore persisted layout once on first attachment.
    this._restoreLayout();
    // Drain queued panels.
    const queue = this._pending;
    this._pending = [];
    for (const item of queue) {
      this._addOrFocus(item.options);
      item.resolve();
    }
    // Persist layout on every change AND notify listeners so
    // consumers (e.g. SessionsPanel "open tab" highlight) can
    // re-read `getPanelIds()`.
    const onLayoutChange = api.onDidLayoutChange(() => {
      this._scheduleLayoutSave();
      for (const cb of this._layoutListeners) cb();
    });
    // Track the active panel so consumers (e.g. SessionsPanel
    // highlight) can subscribe via `onActivePanelChange`.
    this._setActivePanelId(api.activePanel?.id);
    const onActivePanel = api.onDidActivePanelChange((panel) => {
      this._setActivePanelId(panel?.id);
    });
    this._disposeApiListeners = () => {
      onLayoutChange.dispose();
      onActivePanel.dispose();
    };
  }

  detach(): void {
    this._disposeApiListeners?.();
    this._disposeApiListeners = null;
    this._api = null;
    this._setActivePanelId(undefined);
  }

  /** Currently active panel id, or `undefined` if no panel/api. */
  getActivePanelId(): string | undefined {
    return this._activePanelId;
  }

  /**
   * Subscribe to active-panel changes. Returns a disposer. The
   * callback is NOT invoked immediately — read `getActivePanelId()`
   * once at subscribe time if you need an initial snapshot.
   */
  onActivePanelChange(cb: (panelId: string | undefined) => void): () => void {
    this._activeListeners.add(cb);
    return () => {
      this._activeListeners.delete(cb);
    };
  }

  private _setActivePanelId(id: string | undefined): void {
    if (this._activePanelId === id) return;
    this._activePanelId = id;
    for (const cb of this._activeListeners) {
      cb(id);
    }
  }

  /**
   * Either dispatch immediately if the api is online, or queue the
   * panel until `setApi` is called. Returns a promise that resolves
   * once the panel is actually open (mirroring what callers expect
   * from the intent's promise contract).
   */
  showOrFocus(options: ShowDockPanelPayload): Promise<void> {
    if (this._api) {
      this._addOrFocus(options);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this._pending.push({ options, resolve });
    });
  }

  closePanel(panelId: string): void {
    if (!this._api) {
      this._pending = this._pending.filter(
        (p) => p.options.panelId !== panelId,
      );
      return;
    }
    const panel = this._api.getPanel(panelId);
    if (panel) this._api.removePanel(panel);
  }

  focusPanel(panelId: string): void {
    if (!this._api) return;
    const panel = this._api.getPanel(panelId);
    if (panel) panel.focus();
  }

  setPanelTitle(panelId: string, title: string): void {
    if (!this._api) return;
    const panel = this._api.getPanel(panelId);
    panel?.api.setTitle(title);
  }

  /** Snapshot of currently open panel ids (empty if no api attached). */
  getPanelIds(): readonly string[] {
    if (!this._api) return [];
    return this._api.panels.map((p) => p.id);
  }

  /**
   * Subscribe to layout changes (panel add/remove/move/focus). The
   * callback fires after every dock mutation; consumers can call
   * `getPanelIds()` to read the new snapshot. Returns a disposer.
   */
  onLayoutChange(cb: () => void): () => void {
    this._layoutListeners.add(cb);
    return () => {
      this._layoutListeners.delete(cb);
    };
  }

  /**
   * Test seam: read the active api or null if not yet attached.
   */
  _getApi(): DockviewApi | null {
    return this._api;
  }

  /**
   * Test seam: peek at the queue length so tests can verify
   * pre-mount calls were buffered.
   */
  _pendingCount(): number {
    return this._pending.length;
  }

  private _addOrFocus(options: ShowDockPanelPayload): void {
    if (!this._api) return;
    const existing = this._api.getPanel(options.panelId);
    if (existing) {
      if (options.activate ?? true) existing.focus();
      return;
    }
    this._api.addPanel({
      id: options.panelId,
      component: "json",
      params: { specId: options.specId },
      position: options.position ? { direction: options.position } : undefined,
      inactive: options.activate === false,
    });
  }

  private _scheduleLayoutSave(): void {
    if (this._layoutSaveScheduled) return;
    this._layoutSaveScheduled = true;
    queueMicrotask(() => {
      this._layoutSaveScheduled = false;
      this._persistLayout();
    });
  }

  private _persistLayout(): void {
    if (!this._api) return;
    try {
      const json = JSON.stringify(this._api.toJSON());
      globalThis.localStorage?.setItem(LAYOUT_KEY, json);
    } catch (error) {
      console.warn("[chat-mini:dock] failed to persist layout", error);
    }
  }

  private _restoreLayout(): void {
    if (!this._api) return;
    try {
      const raw = globalThis.localStorage?.getItem(LAYOUT_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this._api.fromJSON(data);
    } catch (error) {
      console.warn("[chat-mini:dock] failed to restore layout", error);
    }
  }
}
