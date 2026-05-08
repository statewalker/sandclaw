import type { ComponentType } from "react";

/**
 * Generic shape of a view component registered in `ViewRegistry`.
 * Concrete components may take richer prop types; the registry
 * holds them opaquely (consumers cast at usage time, the same way
 * `CatalogRegistry` holds json-render registries opaquely).
 */
export type ViewComponent = ComponentType<unknown>;

/**
 * Workspace adapter holding React components by string viewKey.
 * The registration surface for slot pattern C (per ADR 0002 §6.4):
 * logic fragments contribute `{ id, viewKey }` slot values; the
 * paired renderer fragments register the React component for that
 * viewKey here. The slot consumer (e.g. composer, turn-view)
 * resolves a viewKey via `ViewRegistry.get` and renders the
 * returned component.
 *
 * ViewKey naming: `<owning-logic-fragment-id>:<purpose>` —
 * e.g. `chat:turn-block:tool-call`, `providers:model-picker`.
 *
 * Same dedicated-class shape as `CatalogRegistry` (id-keyed
 * singleton, throws on duplicate id with different component,
 * primary access pattern is `get(id)`); see the architectural
 * vision note 03 §3.4 "Slot vs. dedicated class".
 */
export class ViewRegistry {
  private readonly _entries = new Map<string, ViewComponent>();
  private readonly _watchers = new Set<
    (entries: ReadonlyMap<string, ViewComponent>) => void
  >();

  declare init?: () => void | Promise<void>;
  declare close?: () => void | Promise<void>;

  /**
   * Add a component under `viewKey`. Throws `RangeError` on a
   * duplicate viewKey with a different component reference.
   * Re-registering the exact same component under the same
   * viewKey is a no-op (the disposer remains valid). Returns a
   * disposer that removes the entry.
   */
  register(viewKey: string, component: ViewComponent): () => void {
    const existing = this._entries.get(viewKey);
    if (existing) {
      if (existing === component) {
        return () => this._removeIfMatches(viewKey, component);
      }
      throw new RangeError(
        `ViewRegistry: viewKey "${viewKey}" is already registered with a different component`,
      );
    }
    this._entries.set(viewKey, component);
    this._notify();
    return () => this._removeIfMatches(viewKey, component);
  }

  get(viewKey: string): ViewComponent | null {
    return this._entries.get(viewKey) ?? null;
  }

  /**
   * Subscribe to registry changes. Synchronously invokes `cb`
   * once with the current entries before returning, then again on
   * every `register` / disposer call. Returns a disposer.
   */
  observe(
    cb: (entries: ReadonlyMap<string, ViewComponent>) => void,
  ): () => void {
    this._watchers.add(cb);
    try {
      cb(this._entries);
    } catch (error) {
      console.error(error);
    }
    return () => {
      this._watchers.delete(cb);
    };
  }

  private _removeIfMatches(viewKey: string, component: ViewComponent): void {
    if (this._entries.get(viewKey) !== component) return;
    this._entries.delete(viewKey);
    this._notify();
  }

  private _notify(): void {
    for (const cb of this._watchers) {
      try {
        cb(this._entries);
      } catch (error) {
        console.error(error);
      }
    }
  }
}
