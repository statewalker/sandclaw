/**
 * Generic id-keyed registry primitive shared by `CatalogRegistry`,
 * `ViewRegistry`, and `InlineContentRegistry`. Each of those is a
 * thin subclass picking the value type — the workspace adapter
 * identity (subclass identity) is what makes
 * `workspace.requireAdapter(SubclassX)` pick out the right
 * registry, while the implementation of `register/get/observe/dispose`
 * is shared.
 *
 * Semantics:
 *   - `register(id, value)` throws `RangeError` on a duplicate id
 *     with a different value reference. Re-registering the exact
 *     same value reference under the same id is a no-op (the
 *     disposer remains valid).
 *   - The disposer removes the entry only when the current entry
 *     for that id still matches the value the disposer was created
 *     with — so calling a disposer twice, or after the entry was
 *     replaced, is safe and a no-op.
 *   - `observe(cb)` invokes `cb` synchronously once with the
 *     current entries before returning, then again on every
 *     `register` / disposer call.
 *
 * The optional lifecycle declarations (`init?`, `close?`) keep
 * subclasses structurally compatible with `WorkspaceAdapter`'s
 * weak shape — same trick as `Slots` / `Intents`.
 */
export class IdentifiableRegistry<T> {
  private readonly _entries = new Map<string, T>();
  private readonly _watchers = new Set<
    (entries: ReadonlyMap<string, T>) => void
  >();
  private _version = 0;

  declare init?: () => void | Promise<void>;
  declare close?: () => void | Promise<void>;

  /**
   * Monotonically-increasing change counter. Bumped on every
   * `register` (new entry) and on every disposer call that
   * actually removes an entry. The value itself is opaque — its
   * only contract is "different number means the registry's
   * contents changed." Wired through `useRegistry` so React
   * consumers re-render via `useSyncExternalStore` (which compares
   * snapshots with `Object.is`).
   */
  get version(): number {
    return this._version;
  }

  register(id: string, value: T): () => void {
    const existing = this._entries.get(id);
    if (existing !== undefined) {
      if (existing === value) {
        return () => this._removeIfMatches(id, value);
      }
      throw new RangeError(
        `${this.constructor.name}: id "${id}" is already registered with a different value`,
      );
    }
    this._entries.set(id, value);
    this._version++;
    this._notify();
    return () => this._removeIfMatches(id, value);
  }

  get(id: string): T | null {
    return this._entries.get(id) ?? null;
  }

  observe(cb: (entries: ReadonlyMap<string, T>) => void): () => void {
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

  private _removeIfMatches(id: string, value: T): void {
    if (this._entries.get(id) !== value) return;
    this._entries.delete(id);
    this._version++;
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
