/** A small async key-value store: remembered vault keys, local-folder handles. */
export interface KeyValueStore<T> {
  get(id: string): Promise<T | undefined>;
  set(id: string, value: T): Promise<void>;
  delete(id: string): Promise<void>;
}

export class MemoryStore<T> implements KeyValueStore<T> {
  private readonly values = new Map<string, T>();
  async get(id: string) {
    return this.values.get(id);
  }
  async set(id: string, value: T) {
    this.values.set(id, value);
  }
  async delete(id: string) {
    this.values.delete(id);
  }
}

/**
 * One IndexedDB database per name, with one object store. IndexedDB keeps
 * structured clones, so a non-extractable `CryptoKey` or a directory handle
 * is stored as itself.
 */
export class IdbStore<T> implements KeyValueStore<T> {
  private db?: Promise<IDBDatabase>;
  constructor(private readonly name: string) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("entries");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.db;
  }

  private async run<R>(
    mode: IDBTransactionMode,
    op: (store: IDBObjectStore) => IDBRequest<R>,
  ): Promise<R> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = op(db.transaction("entries", mode).objectStore("entries"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(id: string): Promise<T | undefined> {
    return (await this.run("readonly", (s) => s.get(id))) as T | undefined;
  }
  async set(id: string, value: T) {
    await this.run("readwrite", (s) => s.put(value, id));
  }
  async delete(id: string) {
    await this.run("readwrite", (s) => s.delete(id));
  }
}
