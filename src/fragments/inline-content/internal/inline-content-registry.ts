import type { ComponentType } from "react";

/**
 * Generic shape of an inline content component. Concrete components
 * cast `props` to their specific shape internally; the registry
 * holds them opaquely (mirrors `ViewRegistry`/`CatalogRegistry`).
 */
export type InlineContentComponent = ComponentType<{ props: unknown }>;

/**
 * Workspace adapter holding inline-content components by id —
 * identity-by-data, primary access pattern is `get(id)` on the
 * render hot path. Same dedicated-class shape as `ViewRegistry`
 * and `CatalogRegistry` (architectural vision note 03 §3.4).
 */
export class InlineContentRegistry {
  private readonly _entries = new Map<string, InlineContentComponent>();
  private readonly _watchers = new Set<
    (entries: ReadonlyMap<string, InlineContentComponent>) => void
  >();

  declare init?: () => void | Promise<void>;
  declare close?: () => void | Promise<void>;

  /**
   * Add a component under `id`. Throws `RangeError` on a duplicate
   * id with a different component reference. Re-registering the
   * same component reference is a no-op (the disposer remains
   * valid). Returns a disposer that removes the entry.
   */
  register(id: string, component: InlineContentComponent): () => void {
    const existing = this._entries.get(id);
    if (existing) {
      if (existing === component) {
        return () => this._removeIfMatches(id, component);
      }
      throw new RangeError(
        `InlineContentRegistry: component id "${id}" is already registered with a different component`,
      );
    }
    this._entries.set(id, component);
    this._notify();
    return () => this._removeIfMatches(id, component);
  }

  get(id: string): InlineContentComponent | null {
    return this._entries.get(id) ?? null;
  }

  /**
   * Subscribe to registry changes. Synchronously invokes `cb` once
   * with the current entries before returning, then again on every
   * `register` / disposer call. Returns a disposer.
   */
  observe(
    cb: (entries: ReadonlyMap<string, InlineContentComponent>) => void,
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

  private _removeIfMatches(
    id: string,
    component: InlineContentComponent,
  ): void {
    if (this._entries.get(id) !== component) return;
    this._entries.delete(id);
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
