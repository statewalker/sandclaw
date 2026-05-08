import type { CatalogEntry } from "../public/types.js";

/**
 * Workspace adapter holding json-render catalogs by id.
 *
 * Using a dedicated class — rather than a `Slot` — because catalogs
 * fit all three "Slot vs. dedicated class" signals from the
 * architectural vision note (notes/2026-05/2026-05-06/03):
 *
 * 1. Identity is in the data: `"files-explorer"` is one catalog;
 *    registering twice = duplicate-id bug, not "two providers
 *    happen to provide the same thing".
 * 2. Primary access pattern is `get(id)` on the JsonPanel hot path,
 *    not "iterate all catalogs".
 * 3. Lifecycle is "rarely changes after boot" — catalogs settle
 *    during fragment init.
 *
 * Keeps the same workspace-adapter contract as `Intents` / `Slots`:
 * one workspace = one registry, accessed via
 * `workspace.requireAdapter(CatalogRegistry)`.
 */
export class CatalogRegistry {
  private readonly _entries = new Map<string, CatalogEntry>();
  private readonly _watchers = new Set<
    (entries: ReadonlyMap<string, CatalogEntry>) => void
  >();

  declare init?: () => void | Promise<void>;
  declare close?: () => void | Promise<void>;

  /**
   * Add a catalog under `id`. Throws `RangeError` on a duplicate id
   * with a different entry. Re-registering the exact same entry
   * reference under the same id is a no-op (the disposer remains
   * valid). Returns a disposer that removes the entry.
   */
  register(id: string, entry: CatalogEntry): () => void {
    const existing = this._entries.get(id);
    if (existing) {
      if (existing === entry) {
        return () => this._removeIfMatches(id, entry);
      }
      throw new RangeError(
        `CatalogRegistry: catalog id "${id}" is already registered with a different entry`,
      );
    }
    this._entries.set(id, entry);
    this._notify();
    return () => this._removeIfMatches(id, entry);
  }

  get(id: string): CatalogEntry | null {
    return this._entries.get(id) ?? null;
  }

  /**
   * Subscribe to registry changes. Synchronously invokes `cb` once
   * with the current entries before returning, then again on every
   * `register` / disposer call. Returns a disposer.
   */
  observe(
    cb: (entries: ReadonlyMap<string, CatalogEntry>) => void,
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

  private _removeIfMatches(id: string, entry: CatalogEntry): void {
    if (this._entries.get(id) !== entry) return;
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
