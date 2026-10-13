// The profiles on this browser ("Work", "Personal"): their names, the only data kept in clear,
// and one vault each.
import { BaseClass } from "@statewalker/shared-baseclass";
import type { KeyValueStore } from "./key-value-store.js";
import { PASSKEY_MESSAGES, type PasskeyAuthenticator, PasskeyProblem } from "./passkeys.js";
import { type ProfileData, SecretVault } from "./secret-vault.js";
import {
  exclusive,
  PROFILES_KEY,
  recordKey,
  rememberedKey,
  vaultLockName,
} from "./vault-records.js";

export interface ProfileInfo {
  id: string;
  name: string;
}

const LOCK = "statewalker-files-profiles";

/** What is wrong with a profile name, or undefined. `except`: the profile being renamed. */
export function validateProfileName(
  name: string,
  profiles: ProfileInfo[],
  except?: string,
): string | undefined {
  const clean = name.trim();
  if (!clean) return "Give the profile a name.";
  const lower = clean.toLowerCase();
  if (profiles.some((p) => p.id !== except && p.name.toLowerCase() === lower)) {
    return `A profile named “${clean}” already exists.`;
  }
  return undefined;
}

export class Profiles extends BaseClass {
  private profiles: ProfileInfo[] = [];
  protected readonly records: KeyValueStore<unknown>;
  protected readonly iterations?: number;

  constructor(opts: { records: KeyValueStore<unknown>; iterations?: number }) {
    super();
    this.records = opts.records;
    this.iterations = opts.iterations;
  }

  async load(): Promise<ProfileInfo[]> {
    this.profiles = await this.stored();
    this.notify();
    return this.list();
  }

  list(): ProfileInfo[] {
    return [...this.profiles];
  }

  /** A new profile with its vault, returned unlocked. */
  create(
    name: string,
    password: string,
    remember: boolean,
    data?: Partial<ProfileData>,
  ): Promise<SecretVault> {
    return exclusive(LOCK, async () => {
      const list = await this.stored();
      const problem = validateProfileName(name, list);
      if (problem) throw new Error(problem);
      const id = crypto.randomUUID();
      const vault = await SecretVault.create({
        records: this.records,
        profile: id,
        password,
        remember,
        data,
        iterations: this.iterations,
      });
      await this.save([...list, { id, name: name.trim() }]);
      return vault;
    });
  }

  /** The profile's vault: unlocked when its key is remembered, locked otherwise. */
  async open(id: string): Promise<SecretVault> {
    const vault = new SecretVault({
      records: this.records,
      profile: id,
      iterations: this.iterations,
    });
    await vault.load();
    return vault;
  }

  rename(id: string, name: string): Promise<void> {
    return exclusive(LOCK, async () => {
      const list = await this.stored();
      const problem = validateProfileName(name, list, id);
      if (problem) throw new Error(problem);
      await this.save(list.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)));
    });
  }

  /** Deletes the profile's vault and remembered key. Nothing in the storages is touched. */
  remove(id: string): Promise<void> {
    // The vault's lock too, so a write in flight cannot put the record back after the delete.
    return exclusive(LOCK, () =>
      exclusive(vaultLockName(id), async () => {
        await this.records.delete(recordKey(id));
        await this.records.delete(rememberedKey(id));
        await this.save((await this.stored()).filter((p) => p.id !== id));
      }),
    );
  }

  /** Adds a passkey named after the profile. False: wrong password. Throws PasskeyProblem. */
  async addPasskey(
    vault: SecretVault,
    password: string,
    authenticator: PasskeyAuthenticator,
  ): Promise<boolean> {
    if (!(await authenticator.available())) {
      throw new PasskeyProblem(PASSKEY_MESSAGES.unsupported);
    }
    const name = (await this.stored()).find((p) => p.id === vault.profile)?.name ?? "";
    return vault.addPasskey(password, () => authenticator.create({ id: vault.profile, name }));
  }

  /** The browser offers every profile's passkey; the chosen one's profile opens, unlocked. */
  async unlockWithPasskey(
    authenticator: PasskeyAuthenticator,
    remember: boolean,
  ): Promise<SecretVault> {
    const answer = await authenticator.get();
    if (!(await this.stored()).some((p) => p.id === answer.userId)) {
      throw new PasskeyProblem(PASSKEY_MESSAGES.unknown);
    }
    const vault = new SecretVault({
      records: this.records,
      profile: answer.userId,
      iterations: this.iterations,
    });
    if (!(await vault.unlockWithPasskey(answer.credentialId, answer.secret, remember))) {
      throw new PasskeyProblem(PASSKEY_MESSAGES.unknown);
    }
    return vault;
  }

  protected async stored(): Promise<ProfileInfo[]> {
    return ((await this.records.get(PROFILES_KEY)) as ProfileInfo[] | undefined) ?? [];
  }

  private async save(list: ProfileInfo[]) {
    await this.records.set(PROFILES_KEY, list);
    this.profiles = list;
    this.notify();
  }
}
