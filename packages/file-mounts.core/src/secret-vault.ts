// The storages' keys, encrypted at rest. A random AES-GCM data key encrypts
// secrets.json; a key derived from the password (PBKDF2) wraps the data key in
// vault.key.json. "Remember" keeps the derived key, non-extractable, in a
// KeyValueStore (IndexedDB in a browser) for a silent unlock.
import { BaseClass } from "@statewalker/shared-baseclass";
import type { FilesApi } from "@statewalker/webrun-files";
import { joinPath, readText, writeText } from "@statewalker/webrun-files";
import type { KeyValueStore } from "./key-value-store.js";

export type VaultState = "absent" | "locked" | "unlocked";

export interface SecretStore {
  readonly state: VaultState;
  create(password: string, remember: boolean): Promise<void>;
  unlock(password: string, remember: boolean): Promise<boolean>;
  lock(): void;
  get(account: string): Promise<string | undefined>;
  set(account: string, value: string | undefined): Promise<void>;
  changePassword(oldPassword: string, newPassword: string): Promise<boolean>;
  forget(): Promise<void>;
  reset(): Promise<void>;
  onUpdate(listener: () => void): () => void;
}

export class SecretsLocked extends Error {
  constructor() {
    super("Locked: unlock to use the S3 storages.");
    this.name = "SecretsLocked";
  }
}

interface KeyFile {
  version: 1;
  id: string;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  wrap: { name: "AES-GCM"; iv: string };
  wrappedKey: string;
}
interface SecretsFile {
  version: 1;
  iv: string;
  data: string;
}

const KEY_FILE = "vault.key.json";
const SECRETS_FILE = "secrets.json";
const LOCK_NAME = "statewalker-files-vault";

const utf8 = (text: string) => new TextEncoder().encode(text);
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  let text = "";
  for (const b of bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) {
    text += String.fromCharCode(b);
  }
  return btoa(text);
}
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

export class SecretVault extends BaseClass implements SecretStore {
  state: VaultState = "absent";
  private keyFile?: KeyFile;
  private dataKey?: CryptoKey;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly files: FilesApi;
  private readonly dir: string;
  private readonly keys: KeyValueStore<CryptoKey>;
  private readonly iterations: number;

  constructor(opts: {
    files: FilesApi;
    dir: string;
    keys: KeyValueStore<CryptoKey>;
    iterations?: number;
  }) {
    super();
    this.files = opts.files;
    this.dir = opts.dir;
    this.keys = opts.keys;
    this.iterations = opts.iterations ?? 600_000;
  }

  /** Reads the vault files; a remembered key unlocks the vault silently. */
  async load(): Promise<VaultState> {
    this.keyFile = await this.readJson<KeyFile>(KEY_FILE);
    this.dataKey = undefined;
    if (!this.keyFile) return this.setState("absent");
    const remembered = await this.keys.get(this.keyFile.id);
    if (remembered) {
      try {
        this.dataKey = await this.unwrap(remembered, this.keyFile, false);
        return this.setState("unlocked");
      } catch {
        await this.keys.delete(this.keyFile.id);
      }
    }
    return this.setState("locked");
  }

  async create(password: string, remember: boolean) {
    if (this.keyFile) throw new Error("A key vault already exists.");
    const id = crypto.randomUUID();
    const salt = random(16);
    const key = await passwordKey(password, salt, this.iterations);
    const dataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const keyFile = await this.wrapFile(id, dataKey, key, salt);
    await this.writeJson(KEY_FILE, keyFile);
    this.keyFile = keyFile;
    this.dataKey = await this.unwrap(key, keyFile, false);
    await this.writeSecrets(new Map());
    if (remember) await this.keys.set(id, key);
    this.setState("unlocked");
  }

  async unlock(password: string, remember: boolean): Promise<boolean> {
    const keyFile = this.keyFile;
    if (!keyFile) return false;
    const key = await passwordKey(password, fromBase64(keyFile.kdf.salt), keyFile.kdf.iterations);
    try {
      this.dataKey = await this.unwrap(key, keyFile, false);
    } catch {
      return false;
    }
    if (remember) await this.keys.set(keyFile.id, key);
    this.setState("unlocked");
    return true;
  }

  lock() {
    this.dataKey = undefined;
    if (this.keyFile) this.setState("locked");
  }

  async get(account: string): Promise<string | undefined> {
    return (await this.readSecrets()).get(account);
  }

  set(account: string, value: string | undefined): Promise<void> {
    // Read, change, write under one lock, so another tab's write in between is kept.
    return this.exclusive(async () => {
      const secrets = await this.readSecrets();
      if (value === undefined) secrets.delete(account);
      else secrets.set(account, value);
      await this.writeSecrets(secrets);
    });
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    const keyFile = this.keyFile;
    if (!keyFile) return false;
    const oldKey = await passwordKey(
      oldPassword,
      fromBase64(keyFile.kdf.salt),
      keyFile.kdf.iterations,
    );
    let dataKey: CryptoKey;
    try {
      dataKey = await this.unwrap(oldKey, keyFile, true);
    } catch {
      return false;
    }
    const salt = random(16);
    const newKey = await passwordKey(newPassword, salt, this.iterations);
    const next = await this.wrapFile(keyFile.id, dataKey, newKey, salt);
    await this.writeJson(KEY_FILE, next);
    this.keyFile = next;
    if (await this.keys.get(keyFile.id)) await this.keys.set(keyFile.id, newKey);
    return true;
  }

  async forget() {
    if (this.keyFile) await this.keys.delete(this.keyFile.id);
  }

  async reset() {
    if (this.keyFile) await this.keys.delete(this.keyFile.id);
    await this.files.remove(joinPath(this.dir, SECRETS_FILE));
    await this.files.remove(joinPath(this.dir, KEY_FILE));
    this.keyFile = undefined;
    this.dataKey = undefined;
    this.setState("absent");
  }

  private setState(state: VaultState): VaultState {
    this.state = state;
    this.notify();
    return state;
  }

  private async wrapFile(
    id: string,
    dataKey: CryptoKey,
    key: CryptoKey,
    salt: Uint8Array<ArrayBuffer>,
  ): Promise<KeyFile> {
    const iv = random(12);
    const wrapped = await crypto.subtle.wrapKey("raw", dataKey, key, {
      name: "AES-GCM",
      iv,
      additionalData: utf8(id),
    });
    return {
      version: 1,
      id,
      kdf: { name: "PBKDF2", hash: "SHA-256", iterations: this.iterations, salt: toBase64(salt) },
      wrap: { name: "AES-GCM", iv: toBase64(iv) },
      wrappedKey: toBase64(wrapped),
    };
  }

  private unwrap(key: CryptoKey, keyFile: KeyFile, extractable: boolean): Promise<CryptoKey> {
    return crypto.subtle.unwrapKey(
      "raw",
      fromBase64(keyFile.wrappedKey),
      key,
      { name: "AES-GCM", iv: fromBase64(keyFile.wrap.iv), additionalData: utf8(keyFile.id) },
      { name: "AES-GCM", length: 256 },
      extractable,
      ["encrypt", "decrypt"],
    );
  }

  private requireKey(): { dataKey: CryptoKey; id: string } {
    if (!this.dataKey || !this.keyFile) throw new SecretsLocked();
    return { dataKey: this.dataKey, id: this.keyFile.id };
  }

  private async readSecrets(): Promise<Map<string, string>> {
    const { dataKey, id } = this.requireKey();
    const file = await this.readJson<SecretsFile>(SECRETS_FILE);
    if (!file) return new Map();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(file.iv), additionalData: utf8(id) },
      dataKey,
      fromBase64(file.data),
    );
    return new Map(Object.entries(JSON.parse(new TextDecoder().decode(plain)) as object));
  }

  private async writeSecrets(secrets: Map<string, string>) {
    const { dataKey, id } = this.requireKey();
    const iv = random(12);
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: utf8(id) },
      dataKey,
      utf8(JSON.stringify(Object.fromEntries(secrets))),
    );
    await this.writeJson(SECRETS_FILE, { version: 1, iv: toBase64(iv), data: toBase64(data) });
  }

  /** One writer at a time: in this tab through a queue, across tabs through Web Locks. */
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const locks = (globalThis as { navigator?: Navigator }).navigator?.locks;
    const run = () => (locks ? locks.request(LOCK_NAME, action) : action());
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async readJson<T>(name: string): Promise<T | undefined> {
    const path = joinPath(this.dir, name);
    if (!(await this.files.exists(path))) return undefined;
    return JSON.parse(await readText(this.files, path)) as T;
  }

  private async writeJson(name: string, value: unknown) {
    await writeText(this.files, joinPath(this.dir, name), JSON.stringify(value, null, 2));
  }
}
