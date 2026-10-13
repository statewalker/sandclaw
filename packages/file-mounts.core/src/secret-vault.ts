// A profile's own data, encrypted at rest in one key-value record: storage keys, mounts, the main
// storage and preferences. A random AES-GCM data key seals it; the data key is wrapped once by a
// key derived from the password (PBKDF2), and once per passkey (Task 2). "Remember" keeps the data
// key itself, non-extractable, in the same store, for a silent unlock.
import { BaseClass } from "@statewalker/shared-baseclass";
import type { KeyValueStore } from "./key-value-store.js";
import type { MountConfig } from "./mount-config.js";
import {
  exclusive,
  newDataKey,
  newPasswordWrap,
  passwordKeyFor,
  recordKey,
  rememberedKey,
  seal,
  unseal,
  unwrap,
  type VaultRecord,
  type Wrapped,
} from "./vault-records.js";

export type VaultState = "locked" | "unlocked";

export interface ProfileData {
  /** Storage keys, by account: "<mount key>/<field>". */
  secrets: Record<string, string>;
  mounts: MountConfig[];
  /** The key of the main mount: the open project. */
  main?: string;
  preferences: Record<string, unknown>;
}

/** What the mount table needs from the vault. */
export interface SecretStore {
  readonly state: VaultState;
  get(account: string): Promise<string | undefined>;
}

export class SecretsLocked extends Error {
  constructor() {
    super("Locked: unlock to use the S3 storages.");
    this.name = "SecretsLocked";
  }
}

const emptyData = (): ProfileData => ({ secrets: {}, mounts: [], preferences: {} });

export class SecretVault extends BaseClass implements SecretStore {
  state: VaultState = "locked";
  readonly profile: string;
  protected dataKey?: CryptoKey;
  protected readonly records: KeyValueStore<unknown>;
  protected readonly iterations: number;

  constructor(opts: { records: KeyValueStore<unknown>; profile: string; iterations?: number }) {
    super();
    this.records = opts.records;
    this.profile = opts.profile;
    this.iterations = opts.iterations ?? 600_000;
  }

  /** Writes a new vault for `profile` and returns it unlocked; refuses to replace one. */
  static async create(opts: {
    records: KeyValueStore<unknown>;
    profile: string;
    password: string;
    remember: boolean;
    data?: Partial<ProfileData>;
    iterations?: number;
  }): Promise<SecretVault> {
    const vault = new SecretVault(opts);
    await vault.exclusive(async () => {
      if (await vault.record()) throw new Error("This profile already has a vault.");
      const id = vault.profile;
      const dataKey = await newDataKey();
      const record: VaultRecord = {
        version: 2,
        id,
        password: await newPasswordWrap(dataKey, id, opts.password, vault.iterations),
        passkeys: [],
        data: await seal(dataKey, id, { ...emptyData(), ...opts.data }),
      };
      await vault.records.set(recordKey(id), record);
      await vault.unlockWith(
        record.password,
        () => passwordKeyFor(record.password, opts.password),
        opts.remember,
      );
    });
    return vault;
  }

  /** A remembered data key unlocks silently; otherwise the vault stays locked. */
  async load(): Promise<VaultState> {
    this.dataKey = undefined;
    const record = await this.record();
    const remembered = (await this.records.get(rememberedKey(this.profile))) as
      | CryptoKey
      | undefined;
    if (record && remembered) {
      try {
        await unseal(remembered, this.profile, record.data);
        this.dataKey = remembered;
        return this.setState("unlocked");
      } catch {
        await this.records.delete(rememberedKey(this.profile));
      }
    }
    return this.setState("locked");
  }

  /** Checks the password against the record as it is now, so another tab's change counts. */
  async unlock(password: string, remember: boolean): Promise<boolean> {
    const record = await this.record();
    if (!record) return false;
    return this.unlockWith(
      record.password,
      () => passwordKeyFor(record.password, password),
      remember,
    );
  }

  lock() {
    this.dataKey = undefined;
    this.setState("locked");
  }

  async read(): Promise<ProfileData> {
    const dataKey = this.requireKey();
    return unseal(dataKey, this.profile, (await this.requireRecord()).data);
  }

  /** Read, change, write under one lock, so another tab's write in between is kept. */
  async update(change: (data: ProfileData) => ProfileData): Promise<ProfileData> {
    const next = await this.exclusive(async () => {
      const dataKey = this.requireKey();
      const record = await this.requireRecord();
      const data = change(await unseal(dataKey, this.profile, record.data));
      await this.records.set(recordKey(this.profile), {
        ...record,
        data: await seal(dataKey, this.profile, data),
      });
      return data;
    });
    this.notify();
    return next;
  }

  async get(account: string): Promise<string | undefined> {
    return (await this.read()).secrets[account];
  }

  async set(account: string, value: string | undefined): Promise<void> {
    await this.update((data) => {
      const secrets = { ...data.secrets };
      if (value === undefined) delete secrets[account];
      else secrets[account] = value;
      return { ...data, secrets };
    });
  }

  /** Re-wraps the one data key: the data and the remembered key stay as they are. */
  changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    return this.exclusive(async () => {
      const record = await this.record();
      if (!record) return false;
      let dataKey: CryptoKey;
      try {
        dataKey = await unwrap(
          record.password,
          await passwordKeyFor(record.password, oldPassword),
          this.profile,
          true,
        );
      } catch {
        return false;
      }
      const password = await newPasswordWrap(dataKey, this.profile, newPassword, this.iterations);
      await this.records.set(recordKey(this.profile), { ...record, password });
      return true;
    });
  }

  /** Drops the remembered key: the next start asks again. */
  async forget() {
    await this.records.delete(rememberedKey(this.profile));
  }

  protected async unlockWith(
    wrapped: Wrapped,
    key: () => Promise<CryptoKey>,
    remember: boolean,
  ): Promise<boolean> {
    let dataKey: CryptoKey;
    try {
      dataKey = await unwrap(wrapped, await key(), this.profile, false);
    } catch {
      return false;
    }
    this.dataKey = dataKey;
    if (remember) await this.records.set(rememberedKey(this.profile), dataKey);
    this.setState("unlocked");
    return true;
  }

  protected async record(): Promise<VaultRecord | undefined> {
    return (await this.records.get(recordKey(this.profile))) as VaultRecord | undefined;
  }

  protected async requireRecord(): Promise<VaultRecord> {
    const record = await this.record();
    if (!record) throw new Error("This profile was removed.");
    return record;
  }

  protected requireKey(): CryptoKey {
    if (!this.dataKey) throw new SecretsLocked();
    return this.dataKey;
  }

  protected exclusive<T>(action: () => Promise<T>): Promise<T> {
    return exclusive(`statewalker-files-vault:${this.profile}`, action);
  }

  private setState(state: VaultState): VaultState {
    this.state = state;
    this.notify();
    return state;
  }
}
