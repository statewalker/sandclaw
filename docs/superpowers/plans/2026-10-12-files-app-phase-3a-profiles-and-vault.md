# Files app, phase 3a: profiles and the vault — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the key vault from two files in browser storage into one IndexedDB record per **profile**, make it hold the person's own data (storage keys, mounts, the main storage, preferences), add **passkey unlock** (WebAuthn PRF) beside the password, and write **archive copies** of that data into a project's system folder.

**Architecture:** All in `@statewalker/file-mounts.core`, React-free. `SecretVault` keeps its name and its `state` / `get` / `set` / `unlock` / `lock` / `changePassword` / `forget` / `onUpdate`, but now stores a `ProfileData` document, sealed with a data key, in a `KeyValueStore<unknown>` record `vault:<profile id>`. The data key is wrapped once by the password key and once per passkey. `Profiles` keeps the list of profile names (the only data in clear) in the same store and creates, opens, renames and removes profiles, and runs the passkey ceremonies through a `PasskeyAuthenticator` (the browser's `webAuthnPasskeys`, or `memoryAuthenticator` for tests and Storybook). `project-archive.ts` writes and reads the archive copies; `main-storage.ts` says which mounts can be main and what a first profile starts with.

**Tech Stack:** TypeScript (strict), vitest, Biome; WebCrypto (AES-GCM, PBKDF2, HKDF, HMAC); WebAuthn PRF; `fake-indexeddb` in tests; `@statewalker/shared-baseclass`; `@statewalker/webrun-files(-mem)`.

**Spec:** `docs/superpowers/specs/2026-10-11-files-app-design.md` — section *Profiles, the vault and the main storage* (all four subsections), *Persistence* under *Storage: mounts*, the 3a row of *Phases*, *Phase 3a* under *Testing*.

## Global Constraints

- Work in the worktree `~/sw-migration/work/sandclaw.worktrees/feat-files-app` (branch `feat/files-app`). Node: `export PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH`.
- Only `packages/file-mounts.core` changes, plus the one test in `packages/file-panels.core/tests/unlock-to-listing.test.ts` that builds a vault.
- React-free: no `react` import. File names kebab-case.
- Tests in `packages/file-mounts.core/tests/*.test.ts`, importing only from `../src/index.js`, against real implementations (real WebCrypto, `MemoryStore`, `IdbStore` over `fake-indexeddb`). `memoryAuthenticator` is the package's own test authenticator: it computes PRF secrets the way an authenticator does (HMAC-SHA256 with a per-credential secret), like `memoryMountType` stands in for a storage.
- Biome forbids non-null assertions (`x!`).
- Messages the person sees, verbatim: "Locked: unlock to use the S3 storages." · "This browser can't use passkeys to unlock; use the password." · "This passkey isn't linked to a profile on this browser." · "The passkey didn't answer; nothing changed." · "Give the profile a name." · `A profile named “<name>” already exists.` · "This profile was removed." · "The archived preferences are damaged; they were left out."
- Vault: AES-GCM-256 data key; password key PBKDF2-SHA256, **600 000** iterations by default (tests pass `iterations: 1000`); passkey key HKDF-SHA256 over the PRF secret with a random 16-byte salt and info `statewalker-files vault passkey`; PRF input `statewalker-files vault v1` (UTF-8); the profile id is the AES-GCM additional data everywhere.
- Store keys: `profiles` (the list), `vault:<id>` (the record), `remembered:<id>` (the remembered data key). Web Lock names: `statewalker-files-profiles`, `statewalker-files-vault:<id>`.
- Archive files: `/.settings/mounts.json` and `/.settings/preferences.json` of the project's `FilesApi`. Secrets never go there.
- No publishing; releases only through `sw.mjs`, never `npm publish`.
- README: each task updates `packages/file-mounts.core/README.md` in the same commit as the behaviour it describes (repo README rules: headings are claims, say what breaks, no history).
- Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz
  ```
- Each task ends green on: `pnpm --filter @statewalker/file-mounts.core test`, `pnpm --filter @statewalker/file-mounts.core typecheck`, `pnpm --filter @statewalker/file-panels.core test`, `pnpm biome check --write --unsafe packages/file-mounts.core packages/file-panels.core` (never at the repo root).

## Decisions made in this plan

1. **No migration from the phase 2 vault files.** Nothing was released and no one has a `/.files/` vault; `SecretVault`'s constructor changes and `create` / `reset` / `load() → "absent"` go away. A profile always has a vault, so `VaultState` is `"locked" | "unlocked"`.
2. **Remember keeps the data key itself, non-extractable**, not the password key: it then survives a password change and works the same after a passkey unlock. Anyone who can read this browser's IndexedDB could use either, so nothing is weakened.
3. **Adding a passkey asks for the password**, and checks it *before* the browser's passkey prompt, so a wrong password never leaves an orphan passkey in the authenticator. Re-wrapping needs the data key in extractable form, which only the password can give.
4. **The PRF input is one constant**, not a salt per profile, so *Unlock with a passkey* can ask the browser before knowing which profile the person picks; the per-wrap HKDF salt keeps the wrapping keys distinct.
5. **No server, so no challenge check.** The challenge is random and local; the protection is the PRF secret, which only the authenticator can produce after user verification.
6. **`MOUNTS_FILE` becomes the archive file** `/.settings/mounts.json`; `loadMountConfigs` / `saveMountConfigs` keep their damaged-file behaviour and are what the archive uses.
7. **Import merges, it never overwrites:** mounts whose key the profile already has, and preferences it already has, are kept.

## Review Focus

1. **A wrong password changes nothing**: `unlock` → `false` and still `locked`; `changePassword` → `false` and every secret reads back; `addPasskey` → `false` and the authenticator is never asked. (Tasks 1, 2)
2. **Two tabs writing at once**: one sets a secret while the other updates the mounts; both changes survive. (Task 1)
3. **A dismissed passkey prompt** leaves the profile locked and no passkey added, with "The passkey didn't answer; nothing changed." (Task 2)
4. **A passkey whose profile was removed** unlocks nothing and says "This passkey isn't linked to a profile on this browser."; removing one profile leaves another, and its remembered key, intact. (Tasks 1, 2)
5. **A damaged archive** imports nothing broken: valid mounts come in, damaged preferences are left out with a problem, the profile's own values are never overwritten. (Task 3)

---

### Task 1: The vault in one record per profile, and the profiles

**Files:**
- Create: `packages/file-mounts.core/src/vault-records.ts` (internal; not exported from `src/index.ts`)
- Rewrite: `packages/file-mounts.core/src/secret-vault.ts`
- Create: `packages/file-mounts.core/src/profiles.ts`
- Modify: `packages/file-mounts.core/src/index.ts` (add `export * from "./profiles.js";`)
- Modify: `packages/file-mounts.core/src/mount-table.ts:190` (drop the `"absent"` line: a profile always has a vault)
- Modify: `packages/file-mounts.core/README.md` (*Why it exists* bullet on keys, *How to use*, *How the vault protects the keys*)
- Delete: `packages/file-mounts.core/tests/secret-vault.test.ts`
- Create: `packages/file-mounts.core/tests/profiles.test.ts`
- Modify: `packages/file-panels.core/tests/unlock-to-listing.test.ts`

**Interfaces:**
- Consumes: `KeyValueStore<T>`, `MemoryStore<T>`, `IdbStore<T>` (`src/key-value-store.ts`); `MountConfig` (`src/mount-config.ts`); `BaseClass` (`notify()`, `onUpdate(cb) → () => void`).
- Produces (exported):
  - `type VaultState = "locked" | "unlocked"`
  - `interface ProfileData { secrets: Record<string, string>; mounts: MountConfig[]; main?: string; preferences: Record<string, unknown> }`
  - `interface SecretStore { readonly state: VaultState; get(account: string): Promise<string | undefined> }` (what `FilesMountTable` needs; unchanged for it)
  - `class SecretsLocked extends Error`
  - `class SecretVault extends BaseClass implements SecretStore`: `static create(opts: { records: KeyValueStore<unknown>; profile: string; password: string; remember: boolean; data?: Partial<ProfileData>; iterations?: number }): Promise<SecretVault>`; `constructor(opts: { records: KeyValueStore<unknown>; profile: string; iterations?: number })`; `readonly profile: string`; `state`; `load(): Promise<VaultState>`; `unlock(password, remember): Promise<boolean>`; `lock(): void`; `read(): Promise<ProfileData>`; `update(change: (data: ProfileData) => ProfileData): Promise<ProfileData>`; `get(account)`; `set(account, value | undefined)`; `changePassword(old, next): Promise<boolean>`; `forget(): Promise<void>`
  - `interface ProfileInfo { id: string; name: string }`
  - `validateProfileName(name: string, profiles: ProfileInfo[], except?: string): string | undefined`
  - `class Profiles extends BaseClass`: `constructor(opts: { records: KeyValueStore<unknown>; iterations?: number })`; `load(): Promise<ProfileInfo[]>`; `list(): ProfileInfo[]`; `create(name, password, remember, data?: Partial<ProfileData>): Promise<SecretVault>`; `open(id): Promise<SecretVault>`; `rename(id, name): Promise<void>`; `remove(id): Promise<void>`
  - Internal, for Task 2 (`src/vault-records.ts`): `recordKey`, `rememberedKey`, `PROFILES_KEY`, `utf8`, `random`, `toBase64`, `fromBase64`, `toBase64Url`, `fromBase64Url`, `passwordKey`, `wrap`, `unwrap`, `exclusive`, `type Wrapped`, `type PasswordWrap`, `type PasskeyWrap`, `type VaultRecord`

- [ ] **Step 1: Write the failing tests.** Delete `tests/secret-vault.test.ts` and create `tests/profiles.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  IdbStore,
  MemoryStore,
  type MountConfig,
  Profiles,
  SecretsLocked,
  validateProfileName,
} from "../src/index.js";

const newProfiles = (records = new MemoryStore<unknown>()) =>
  new Profiles({ records, iterations: 1000 });
const browser: MountConfig = { key: "browser", name: "Browser storage", type: "opfs", config: {} };

describe("Profiles and their vaults", () => {
  it("create lists the profile and returns its vault unlocked; nothing secret is stored in clear", async () => {
    const records = new MemoryStore<unknown>();
    const profiles = newProfiles(records);
    expect(await profiles.load()).toEqual([]);
    const vault = await profiles.create("  Work ", "correct horse", false, {
      mounts: [browser],
      main: "browser",
    });
    expect(profiles.list()).toEqual([{ id: vault.profile, name: "Work" }]);
    expect(vault.state).toBe("unlocked");
    await vault.set("archive/secretAccessKey", "s3cr3t-value");
    expect(await vault.get("archive/secretAccessKey")).toBe("s3cr3t-value");
    expect(await vault.read()).toEqual({
      secrets: { "archive/secretAccessKey": "s3cr3t-value" },
      mounts: [browser],
      main: "browser",
      preferences: {},
    });
    const stored = JSON.stringify(await records.get(`vault:${vault.profile}`));
    expect(stored).not.toContain("s3cr3t-value");
    expect(stored).not.toContain("Browser storage");
  });

  it("a fresh open is locked; the right password unlocks, a wrong one changes nothing", async () => {
    const records = new MemoryStore<unknown>();
    const first = await newProfiles(records).create("Work", "correct horse", false);
    await first.set("a/k", "v");

    const profiles = newProfiles(records);
    await profiles.load();
    const vault = await profiles.open(first.profile);
    expect(vault.state).toBe("locked");
    await expect(vault.get("a/k")).rejects.toBeInstanceOf(SecretsLocked);
    await expect(vault.get("a/k")).rejects.toThrow("Locked: unlock to use the S3 storages.");
    expect(await vault.unlock("wrong", false)).toBe(false);
    expect(vault.state).toBe("locked");
    expect(await vault.unlock("correct horse", false)).toBe(true);
    expect(await vault.get("a/k")).toBe("v");
    vault.lock();
    expect(vault.state).toBe("locked");
  });

  it("remember unlocks silently on the next open, also after a password change; forget stops it", async () => {
    const records = new MemoryStore<unknown>();
    const vault = await newProfiles(records).create("Work", "p1", true);
    expect((await newProfiles(records).open(vault.profile)).state).toBe("unlocked");
    expect(await vault.changePassword("p1", "p2")).toBe(true);
    expect((await newProfiles(records).open(vault.profile)).state).toBe("unlocked");
    await vault.forget();
    expect((await newProfiles(records).open(vault.profile)).state).toBe("locked");
  });

  it("changePassword: a wrong old password changes nothing; the right one keeps everything", async () => {
    const records = new MemoryStore<unknown>();
    const vault = await newProfiles(records).create("Work", "old", false, { mounts: [browser] });
    await vault.set("a/k", "v");
    expect(await vault.changePassword("not it", "new")).toBe(false);
    expect(await vault.changePassword("old", "new")).toBe(true);
    const again = await newProfiles(records).open(vault.profile);
    expect(await again.unlock("old", false)).toBe(false);
    expect(await again.unlock("new", false)).toBe(true);
    expect(await again.get("a/k")).toBe("v");
    expect((await again.read()).mounts).toEqual([browser]);
  });

  it("two tabs writing at once keep both changes", async () => {
    const records = new MemoryStore<unknown>();
    const a = await newProfiles(records).create("Work", "pw", false);
    const b = await newProfiles(records).open(a.profile);
    await b.unlock("pw", false);
    await Promise.all([
      a.set("one/k", "1"),
      b.update((data) => ({ ...data, mounts: [browser], main: "browser" })),
    ]);
    expect(await a.read()).toEqual({
      secrets: { "one/k": "1" },
      mounts: [browser],
      main: "browser",
      preferences: {},
    });
  });

  it("a stale tab's changePassword and unlock check the password as it is now", async () => {
    const records = new MemoryStore<unknown>();
    const a = await newProfiles(records).create("Work", "p1", false);
    const b = await newProfiles(records).open(a.profile);
    expect(await a.changePassword("p1", "p2")).toBe(true);
    expect(await b.unlock("p1", false)).toBe(false);
    expect(await b.changePassword("p1", "p3")).toBe(false);
    expect(await b.changePassword("p2", "p3")).toBe(true);
    expect(await (await newProfiles(records).open(a.profile)).unlock("p3", false)).toBe(true);
  });

  it("update and unlock notify; set(account, undefined) deletes", async () => {
    const vault = await newProfiles().create("Work", "pw", false);
    const seen: string[] = [];
    vault.onUpdate(() => seen.push(vault.state));
    await vault.set("a/k", "v");
    await vault.set("a/k", undefined);
    expect(await vault.get("a/k")).toBeUndefined();
    vault.lock();
    expect(seen).toEqual(["unlocked", "unlocked", "locked"]);
  });

  it("names: required, unique ignoring case; rename follows the same rule", async () => {
    const profiles = newProfiles();
    await expect(profiles.create("  ", "pw", false)).rejects.toThrow("Give the profile a name.");
    const work = await profiles.create("Work", "pw", false);
    await expect(profiles.create("work", "pw", false)).rejects.toThrow(
      "A profile named “work” already exists.",
    );
    const home = await profiles.create("Personal", "pw", false);
    await expect(profiles.rename(home.profile, "WORK")).rejects.toThrow(
      "A profile named “WORK” already exists.",
    );
    await profiles.rename(work.profile, "Work (old)");
    expect(profiles.list().map((p) => p.name)).toEqual(["Work (old)", "Personal"]);
    expect(validateProfileName("Personal", profiles.list(), home.profile)).toBeUndefined();
  });

  it("remove deletes one profile, its vault and remembered key; the others stay", async () => {
    const records = new MemoryStore<unknown>();
    const profiles = newProfiles(records);
    const work = await profiles.create("Work", "pw", true);
    const home = await profiles.create("Personal", "pw", true);
    await profiles.remove(work.profile);
    expect(profiles.list()).toEqual([{ id: home.profile, name: "Personal" }]);
    expect(await records.get(`vault:${work.profile}`)).toBeUndefined();
    expect(await records.get(`remembered:${work.profile}`)).toBeUndefined();
    await expect(work.set("a/k", "v")).rejects.toThrow("This profile was removed.");
    expect((await newProfiles(records).open(home.profile)).state).toBe("unlocked");
  });

  it("profiles and remembered keys survive in IndexedDB", async () => {
    const vault = await newProfiles(new IdbStore("profiles-test")).create("Work", "pw", true);
    await vault.set("a/k", "v");
    const profiles = newProfiles(new IdbStore("profiles-test"));
    expect(await profiles.load()).toEqual([{ id: vault.profile, name: "Work" }]);
    const again = await profiles.open(vault.profile);
    expect(again.state).toBe("unlocked");
    expect(await again.get("a/k")).toBe("v");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail.**

Run: `cd ~/sw-migration/work/sandclaw.worktrees/feat-files-app && pnpm --filter @statewalker/file-mounts.core test -- tests/profiles.test.ts`
Expected: FAIL — `Profiles` / `validateProfileName` are not exported.

- [ ] **Step 3: The record layout and crypto.** Create `src/vault-records.ts`:

```ts
// The vault's record layout and its crypto, shared by SecretVault and Profiles.
// Internal: src/index.ts does not export this module.
import type { ProfileData } from "./secret-vault.js";

export interface Wrapped {
  iv: string;
  wrappedKey: string;
}
export interface PasswordWrap extends Wrapped {
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
}
export interface PasskeyWrap extends Wrapped {
  credentialId: string;
  salt: string;
  createdAt: string;
}
export interface VaultRecord {
  version: 2;
  id: string;
  password: PasswordWrap;
  passkeys: PasskeyWrap[];
  data: { iv: string; data: string };
}

export const PROFILES_KEY = "profiles";
export const recordKey = (profile: string) => `vault:${profile}`;
export const rememberedKey = (profile: string) => `remembered:${profile}`;

export const utf8 = (text: string) => new TextEncoder().encode(text);
export const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  let text = "";
  for (const b of bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) {
    text += String.fromCharCode(b);
  }
  return btoa(text);
}
export const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
export const toBase64Url = (bytes: ArrayBuffer | Uint8Array) =>
  toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromBase64Url = (text: string) =>
  fromBase64(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));

export async function passwordKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** The key a password wrap was made with, from the password given now. */
export const passwordKeyFor = (wrap: PasswordWrap, password: string) =>
  passwordKey(password, fromBase64(wrap.kdf.salt), wrap.kdf.iterations);

export async function newPasswordWrap(
  dataKey: CryptoKey,
  id: string,
  password: string,
  iterations: number,
): Promise<PasswordWrap> {
  const salt = random(16);
  const key = await passwordKey(password, salt, iterations);
  return {
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: toBase64(salt) },
    ...(await wrap(dataKey, key, id)),
  };
}

export async function wrap(dataKey: CryptoKey, key: CryptoKey, id: string): Promise<Wrapped> {
  const iv = random(12);
  const wrapped = await crypto.subtle.wrapKey("raw", dataKey, key, {
    name: "AES-GCM",
    iv,
    additionalData: utf8(id),
  });
  return { iv: toBase64(iv), wrappedKey: toBase64(wrapped) };
}

export function unwrap(
  wrapped: Wrapped,
  key: CryptoKey,
  id: string,
  extractable: boolean,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64(wrapped.wrappedKey),
    key,
    { name: "AES-GCM", iv: fromBase64(wrapped.iv), additionalData: utf8(id) },
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}

export const newDataKey = () =>
  crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

export async function seal(
  dataKey: CryptoKey,
  id: string,
  data: ProfileData,
): Promise<VaultRecord["data"]> {
  const iv = random(12);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(id) },
    dataKey,
    utf8(JSON.stringify(data)),
  );
  return { iv: toBase64(iv), data: toBase64(sealed) };
}

export async function unseal(
  dataKey: CryptoKey,
  id: string,
  sealed: VaultRecord["data"],
): Promise<ProfileData> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv), additionalData: utf8(id) },
    dataKey,
    fromBase64(sealed.data),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as ProfileData;
}

const queues = new Map<string, Promise<unknown>>();

/** One writer at a time per name: in this tab through a queue, across tabs through Web Locks. */
export function exclusive<T>(name: string, action: () => Promise<T>): Promise<T> {
  const locks = (globalThis as { navigator?: Navigator }).navigator?.locks;
  const run = () => (locks ? locks.request(name, action) : action());
  const result = (queues.get(name) ?? Promise.resolve()).then(run, run);
  queues.set(
    name,
    result.catch(() => undefined),
  );
  return result;
}
```

- [ ] **Step 4: The vault.** Replace `src/secret-vault.ts` with:

```ts
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
      await vault.unlockWith(record.password, () => passwordKeyFor(record.password, opts.password), opts.remember);
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
    return this.unlockWith(record.password, () => passwordKeyFor(record.password, password), remember);
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
```

Note `seen` in the test expects exactly `["unlocked", "unlocked", "locked"]`: two `update` notifications and one from `lock()`. `create` notifies before the listener is attached.

- [ ] **Step 5: The profiles.** Create `src/profiles.ts`:

```ts
// The profiles on this browser ("Work", "Personal"): their names, the only data kept in clear,
// and one vault each.
import { BaseClass } from "@statewalker/shared-baseclass";
import type { KeyValueStore } from "./key-value-store.js";
import { type ProfileData, SecretVault } from "./secret-vault.js";
import { exclusive, PROFILES_KEY, recordKey, rememberedKey } from "./vault-records.js";

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
    const vault = new SecretVault({ records: this.records, profile: id, iterations: this.iterations });
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
    return exclusive(LOCK, async () => {
      await this.records.delete(recordKey(id));
      await this.records.delete(rememberedKey(id));
      await this.save((await this.stored()).filter((p) => p.id !== id));
    });
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
```

The `data` argument is passed to `SecretVault.create` only when given; if TypeScript complains about `data: undefined` under the current tsconfig, spread it: `...(data ? { data } : {})` (same for `iterations`).

Add `export * from "./profiles.js";` to `src/index.ts` (keep the list alphabetical). Do **not** add `vault-records.js`.

In `src/mount-table.ts`, delete the line `if (this.secrets.state === "absent") return undefined;` (line 190). Every mount now belongs to a profile with a vault, so a locked vault always means `SecretsLocked`; `tests/mount-table.test.ts` must still pass unchanged — if one of its tests relied on an absent vault returning no secret, give that test an unlocked vault (`await new Profiles({ records: new MemoryStore<unknown>(), iterations: 1000 }).create("Me", "pw", false)`) and say so in the report.

- [ ] **Step 6: The panel test that builds a vault.** In `packages/file-panels.core/tests/unlock-to-listing.test.ts`, replace the `SecretVault` import with `Profiles`, and the vault setup (the `new SecretVault({...})`, `load`, `create` lines) with:

```ts
    const profiles = new Profiles({ records: new MemoryStore<unknown>(), iterations: 1000 });
    const vault = await profiles.create("Me", "pw", false);
    await vault.set("archive/accessKeyId", "AKIA");
    vault.lock();
```

Remove the now-unused `appFiles` constant. The rest of the test is unchanged.

- [ ] **Step 7: Run the tests.**

Run: `pnpm --filter @statewalker/file-mounts.core test && pnpm --filter @statewalker/file-panels.core test`
Expected: PASS (all files; `tests/profiles.test.ts` 10 tests).

- [ ] **Step 8: README.** In `packages/file-mounts.core/README.md`:
  - *Why it exists*, the keys bullet becomes: "**The person's keys and storages must not sit in plain text.** Each profile's data lives in one encrypted IndexedDB record, unlocked by a password (or a passkey)."
  - *How to use*: replace the `settingsFiles` / `SecretVault` / `loadMountConfigs` lines with profiles:

```ts
const records = new IdbStore<unknown>("statewalker-files");
const profiles = new Profiles({ records });
const [first] = await profiles.load();
const vault = first
  ? await profiles.open(first.id) // unlocked when remembered; else vault.unlock(password, remember)
  : await profiles.create("Personal", password, true, firstProfileData(opfsMountType().isAvailable().ok));

const table = new FilesMountTable({ types: [/* as before */], secrets: vault });
await table.apply((await vault.read()).mounts);
```

   (`firstProfileData` arrives in Task 3; until then write the `create` call without the fourth argument and Task 3 adds it.) Keep the paragraphs after the code, replacing `configs` with `(await vault.read()).mounts`.
  - *How the vault protects the keys*: rewrite to describe the record (`vault:<id>` in one `KeyValueStore`), the sealed `ProfileData` (secrets, mounts, main, preferences), the profile id as additional data, the 600 000 iterations paragraph (keep), *Remember* storing the **data key**, non-extractable, at `remembered:<id>` (and why: it survives a password change and works after any unlock; whoever reads this browser's IndexedDB could use a remembered password key just as well), the Web Lock per profile and re-reading the record on every write, a wrong password changing nothing, and recovery: "A lost password cannot be recovered. `profiles.remove(id)` deletes the vault and its remembered key; the files in the storages are not touched, but the mounts and keys must be entered again."

- [ ] **Step 9: Checks and commit.**

```bash
cd ~/sw-migration/work/sandclaw.worktrees/feat-files-app
pnpm --filter @statewalker/file-mounts.core typecheck
pnpm biome check --write --unsafe packages/file-mounts.core packages/file-panels.core
git add packages/file-mounts.core packages/file-panels.core/tests/unlock-to-listing.test.ts
git commit -m "feat(file-mounts.core): profiles, each with its vault in one IndexedDB record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz"
```

---

### Task 2: Passkey unlock (WebAuthn PRF)

**Files:**
- Create: `packages/file-mounts.core/src/passkeys.ts`
- Modify: `packages/file-mounts.core/src/vault-records.ts` (add `passkeyKey`, `newPasskeyWrap`)
- Modify: `packages/file-mounts.core/src/secret-vault.ts` (add `addPasskey`, `removePasskey`, `passkeys`, `unlockWithPasskey`)
- Modify: `packages/file-mounts.core/src/profiles.ts` (add `addPasskey`, `unlockWithPasskey`)
- Modify: `packages/file-mounts.core/src/index.ts` (add `export * from "./passkeys.js";`)
- Modify: `packages/file-mounts.core/README.md` (new Internals section on passkeys; a line in *How to use*)
- Create: `packages/file-mounts.core/tests/passkeys.test.ts`

**Interfaces:**
- Consumes (Task 1): `SecretVault` and its protected `records`, `profile`, `requireKey()`, `record()`, `requireRecord()`, `exclusive()`, `unlockWith()`; `Profiles` and its protected `stored()`; from `vault-records.ts`: `wrap`, `unwrap`, `passwordKeyFor`, `random`, `toBase64`, `fromBase64`, `toBase64Url`, `fromBase64Url`, `utf8`, `recordKey`, `type PasskeyWrap`.
- Produces (exported):
  - `interface PasskeyAuthenticator { available(): Promise<boolean>; create(user: { id: string; name: string }): Promise<{ credentialId: string; secret: Uint8Array }>; get(): Promise<{ credentialId: string; userId: string; secret: Uint8Array }> }`
  - `class PasskeyProblem extends Error` (its `message` is shown to the person)
  - `PASSKEY_MESSAGES = { unsupported, unknown, noAnswer }` (the three messages from *Global Constraints*)
  - `interface MemoryAuthenticator extends PasskeyAuthenticator { pick?: string; dismissNext: boolean; readonly credentials: readonly { id: string; userId: string; name: string }[] }`, `memoryAuthenticator(opts?: { prf?: boolean }): MemoryAuthenticator`
  - `webAuthnPasskeys(opts: { rpName: string; rpId?: string }): PasskeyAuthenticator`
  - `SecretVault.addPasskey(password, register: () => Promise<{ credentialId: string; secret: Uint8Array }>): Promise<boolean>`, `removePasskey(credentialId): Promise<void>`, `passkeys(): Promise<{ credentialId: string; createdAt: string }[]>`, `unlockWithPasskey(credentialId, secret, remember): Promise<boolean>`
  - `Profiles.addPasskey(vault, password, authenticator): Promise<boolean>`, `Profiles.unlockWithPasskey(authenticator, remember): Promise<SecretVault>`

- [ ] **Step 1: Write the failing tests.** Create `tests/passkeys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MemoryStore,
  memoryAuthenticator,
  PASSKEY_MESSAGES,
  PasskeyProblem,
  Profiles,
  webAuthnPasskeys,
} from "../src/index.js";

const newProfiles = (records = new MemoryStore<unknown>()) =>
  new Profiles({ records, iterations: 1000 });

describe("passkeys", () => {
  it("a passkey added with the password unlocks its own profile, chosen among several", async () => {
    const records = new MemoryStore<unknown>();
    const profiles = newProfiles(records);
    const auth = memoryAuthenticator();
    const work = await profiles.create("Work", "pw-work", false);
    const home = await profiles.create("Personal", "pw-home", false);
    await home.set("a/k", "home secret");
    expect(await profiles.addPasskey(work, "pw-work", auth)).toBe(true);
    expect(await profiles.addPasskey(home, "pw-home", auth)).toBe(true);
    expect(auth.credentials.map((c) => [c.userId, c.name])).toEqual([
      [work.profile, "Work"],
      [home.profile, "Personal"],
    ]);
    expect(await home.passkeys()).toEqual([
      { credentialId: auth.credentials[1]?.id, createdAt: expect.any(String) },
    ]);

    const later = newProfiles(records);
    await later.load();
    auth.pick = auth.credentials[1]?.id;
    const vault = await later.unlockWithPasskey(auth, false);
    expect(vault.profile).toBe(home.profile);
    expect(vault.state).toBe("unlocked");
    expect(await vault.get("a/k")).toBe("home secret");
  });

  it("a wrong password adds nothing and never asks the authenticator", async () => {
    const profiles = newProfiles();
    const auth = memoryAuthenticator();
    const vault = await profiles.create("Work", "pw", false);
    expect(await profiles.addPasskey(vault, "wrong", auth)).toBe(false);
    expect(auth.credentials).toEqual([]);
    expect(await vault.passkeys()).toEqual([]);
  });

  it("a dismissed prompt changes nothing: no passkey added, a locked profile stays locked", async () => {
    const records = new MemoryStore<unknown>();
    const profiles = newProfiles(records);
    const auth = memoryAuthenticator();
    const vault = await profiles.create("Work", "pw", false);
    auth.dismissNext = true;
    await expect(profiles.addPasskey(vault, "pw", auth)).rejects.toThrow(PASSKEY_MESSAGES.noAnswer);
    expect(await vault.passkeys()).toEqual([]);

    expect(await profiles.addPasskey(vault, "pw", auth)).toBe(true);
    const later = newProfiles(records);
    auth.dismissNext = true;
    await expect(later.unlockWithPasskey(auth, false)).rejects.toThrow(
      "The passkey didn't answer; nothing changed.",
    );
    expect((await later.open(vault.profile)).state).toBe("locked");
  });

  it("a passkey of a removed profile, or a removed passkey, unlocks nothing", async () => {
    const records = new MemoryStore<unknown>();
    const profiles = newProfiles(records);
    const auth = memoryAuthenticator();
    const work = await profiles.create("Work", "pw", false);
    const home = await profiles.create("Personal", "pw", false);
    await profiles.addPasskey(work, "pw", auth);
    await profiles.addPasskey(home, "pw", auth);

    auth.pick = auth.credentials[0]?.id;
    await profiles.remove(work.profile);
    const error = await profiles.unlockWithPasskey(auth, false).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PasskeyProblem);
    expect((error as Error).message).toBe("This passkey isn't linked to a profile on this browser.");

    const [homePasskey] = await home.passkeys();
    await home.removePasskey(homePasskey?.credentialId ?? "");
    auth.pick = auth.credentials[1]?.id;
    await expect(newProfiles(records).unlockWithPasskey(auth, false)).rejects.toThrow(
      PASSKEY_MESSAGES.unknown,
    );
    expect(await (await newProfiles(records).open(home.profile)).unlock("pw", false)).toBe(true);
  });

  it("remember after a passkey unlock opens the profile silently next time", async () => {
    const records = new MemoryStore<unknown>();
    const auth = memoryAuthenticator();
    const profiles = newProfiles(records);
    const vault = await profiles.create("Work", "pw", false);
    await profiles.addPasskey(vault, "pw", auth);
    await newProfiles(records).unlockWithPasskey(auth, true);
    expect((await newProfiles(records).open(vault.profile)).state).toBe("unlocked");
  });

  it("an authenticator without PRF is unavailable, and adding a passkey says why", async () => {
    const profiles = newProfiles();
    const auth = memoryAuthenticator({ prf: false });
    expect(await auth.available()).toBe(false);
    const vault = await profiles.create("Work", "pw", false);
    await expect(profiles.addPasskey(vault, "pw", auth)).rejects.toThrow(
      "This browser can't use passkeys to unlock; use the password.",
    );
    expect(await vault.passkeys()).toEqual([]);
  });

  it("outside a browser, WebAuthn passkeys are unavailable", async () => {
    expect(await webAuthnPasskeys({ rpName: "Files" }).available()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail.**

Run: `pnpm --filter @statewalker/file-mounts.core test -- tests/passkeys.test.ts`
Expected: FAIL — `memoryAuthenticator` is not exported.

- [ ] **Step 3: Passkey wraps.** Append to `src/vault-records.ts`:

```ts
/** The key a passkey wrap is made with: HKDF over the authenticator's PRF secret. */
export async function passkeyKey(secret: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new Uint8Array(secret), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(salt),
      info: utf8("statewalker-files vault passkey"),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

export async function newPasskeyWrap(
  dataKey: CryptoKey,
  id: string,
  credentialId: string,
  secret: Uint8Array,
): Promise<PasskeyWrap> {
  const salt = random(16);
  return {
    credentialId,
    salt: toBase64(salt),
    createdAt: new Date().toISOString(),
    ...(await wrap(dataKey, await passkeyKey(secret, salt), id)),
  };
}
```

- [ ] **Step 4: The authenticators.** Create `src/passkeys.ts`:

```ts
// Passkeys that unlock a vault through the WebAuthn PRF extension: the authenticator returns the
// same 32-byte secret for this site and a fixed input, after verifying the person.
import { fromBase64Url, random, toBase64Url, utf8 } from "./vault-records.js";

export interface PasskeyAuthenticator {
  /** Whether this browser can unlock with a passkey (PRF support). */
  available(): Promise<boolean>;
  /** Registers a passkey for the profile and returns its PRF secret. */
  create(user: { id: string; name: string }): Promise<{ credentialId: string; secret: Uint8Array }>;
  /** Asks for any passkey of this site; `userId` is the profile it was created for. */
  get(): Promise<{ credentialId: string; userId: string; secret: Uint8Array }>;
}

export const PASSKEY_MESSAGES = {
  unsupported: "This browser can't use passkeys to unlock; use the password.",
  unknown: "This passkey isn't linked to a profile on this browser.",
  noAnswer: "The passkey didn't answer; nothing changed.",
} as const;

/** A passkey step that did not work; the message is what the person sees. */
export class PasskeyProblem extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PasskeyProblem";
  }
}

const PRF_INPUT = utf8("statewalker-files vault v1");

export interface MemoryAuthenticator extends PasskeyAuthenticator {
  /** The credential the next `get` answers with: the person's pick. Default: the newest. */
  pick?: string;
  /** The next `create` or `get` is dismissed, as when the person closes the prompt. */
  dismissNext: boolean;
  readonly credentials: readonly { id: string; userId: string; name: string }[];
}

/**
 * An authenticator in memory, for tests and Storybook: each credential has its own HMAC key, and
 * its PRF secret is HMAC-SHA256(key, input), as a real authenticator computes it.
 */
export function memoryAuthenticator(opts: { prf?: boolean } = {}): MemoryAuthenticator {
  const prf = opts.prf ?? true;
  const keys = new Map<string, CryptoKey>();
  const credentials: { id: string; userId: string; name: string }[] = [];
  const secretOf = async (id: string) => {
    const key = keys.get(id);
    if (!key) throw new PasskeyProblem(PASSKEY_MESSAGES.unknown);
    return new Uint8Array(await crypto.subtle.sign("HMAC", key, PRF_INPUT));
  };
  const auth: MemoryAuthenticator = {
    dismissNext: false,
    credentials,
    async available() {
      return prf;
    },
    async create(user) {
      if (auth.dismissNext) {
        auth.dismissNext = false;
        throw new PasskeyProblem(PASSKEY_MESSAGES.noAnswer);
      }
      if (!prf) throw new PasskeyProblem(PASSKEY_MESSAGES.unsupported);
      const id = toBase64Url(random(16));
      keys.set(
        id,
        await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
      );
      credentials.push({ id, userId: user.id, name: user.name });
      return { credentialId: id, secret: await secretOf(id) };
    },
    async get() {
      if (auth.dismissNext) {
        auth.dismissNext = false;
        throw new PasskeyProblem(PASSKEY_MESSAGES.noAnswer);
      }
      const credential = credentials.find((c) => c.id === auth.pick) ?? credentials.at(-1);
      if (!credential) throw new PasskeyProblem(PASSKEY_MESSAGES.noAnswer);
      return {
        credentialId: credential.id,
        userId: credential.userId,
        secret: await secretOf(credential.id),
      };
    },
  };
  return auth;
}

type PrfOutputs = { enabled?: boolean; results?: { first?: BufferSource } };
const prfOf = (c: PublicKeyCredential) =>
  (c.getClientExtensionResults() as { prf?: PrfOutputs }).prf;
const bytesOf = (b: BufferSource) =>
  b instanceof ArrayBuffer
    ? new Uint8Array(b)
    : new Uint8Array(b.buffer as ArrayBuffer, b.byteOffset, b.byteLength);
const prfInputs = { prf: { eval: { first: PRF_INPUT } } } as AuthenticationExtensionsClientInputs;

/** The browser's passkeys. Discoverable credentials, user verification required. */
export function webAuthnPasskeys(opts: { rpName: string; rpId?: string }): PasskeyAuthenticator {
  const rpId = opts.rpId ? { rpId: opts.rpId } : {};
  const credentials = () => (globalThis as { navigator?: Navigator }).navigator?.credentials;

  async function ask<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof PasskeyProblem) throw error;
      throw new PasskeyProblem(PASSKEY_MESSAGES.noAnswer, { cause: error });
    }
  }

  const assert = (only?: string) =>
    ask(async () => {
      const c = (await credentials()?.get({
        publicKey: {
          challenge: random(32),
          ...rpId,
          userVerification: "required",
          allowCredentials: only ? [{ type: "public-key", id: fromBase64Url(only) }] : [],
          extensions: prfInputs,
        },
      })) as PublicKeyCredential | null | undefined;
      const first = c ? prfOf(c)?.results?.first : undefined;
      if (!c || !first) throw new PasskeyProblem(PASSKEY_MESSAGES.unsupported);
      const handle = (c.response as AuthenticatorAssertionResponse).userHandle;
      return {
        credentialId: toBase64Url(c.rawId),
        userId: handle ? new TextDecoder().decode(handle) : "",
        secret: bytesOf(first),
      };
    });

  return {
    async available() {
      const pkc = (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential as
        | { getClientCapabilities?(): Promise<Record<string, boolean>> }
        | undefined;
      const capabilities = await pkc?.getClientCapabilities?.().catch(() => undefined);
      return capabilities?.["extension:prf"] === true;
    },
    async create(user) {
      const c = await ask(
        async () =>
          (await credentials()?.create({
            publicKey: {
              rp: { name: opts.rpName, ...(opts.rpId ? { id: opts.rpId } : {}) },
              user: { id: utf8(user.id), name: user.name, displayName: user.name },
              challenge: random(32),
              pubKeyCredParams: [
                { type: "public-key", alg: -7 },
                { type: "public-key", alg: -257 },
              ],
              authenticatorSelection: { residentKey: "required", userVerification: "required" },
              extensions: prfInputs,
            },
          })) as PublicKeyCredential | null | undefined,
      );
      const prf = c ? prfOf(c) : undefined;
      if (!c || !prf?.enabled) throw new PasskeyProblem(PASSKEY_MESSAGES.unsupported);
      const credentialId = toBase64Url(c.rawId);
      // Some authenticators give the secret at creation; the others need one more prompt.
      const first = prf.results?.first;
      if (first) return { credentialId, secret: bytesOf(first) };
      return { credentialId, secret: (await assert(credentialId)).secret };
    },
    get: () => assert(),
  };
}
```

Add `export * from "./passkeys.js";` to `src/index.ts`.

- [ ] **Step 5: The vault's passkey methods.** Add to `SecretVault` in `src/secret-vault.ts` (imports: `newPasskeyWrap`, `passkeyKey`, `fromBase64`, `type PasskeyWrap` from `./vault-records.js`):

```ts
  /**
   * Adds a passkey. The password is checked first, so a wrong one never reaches the browser's
   * passkey prompt; `register` runs that prompt. False: wrong password.
   */
  async addPasskey(
    password: string,
    register: () => Promise<{ credentialId: string; secret: Uint8Array }>,
  ): Promise<boolean> {
    const record = await this.requireRecord();
    let dataKey: CryptoKey;
    try {
      dataKey = await unwrap(
        record.password,
        await passwordKeyFor(record.password, password),
        this.profile,
        true,
      );
    } catch {
      return false;
    }
    const { credentialId, secret } = await register();
    const passkey = await newPasskeyWrap(dataKey, this.profile, credentialId, secret);
    await this.exclusive(async () => {
      const now = await this.requireRecord();
      const passkeys = [...now.passkeys.filter((p) => p.credentialId !== credentialId), passkey];
      await this.records.set(recordKey(this.profile), { ...now, passkeys });
    });
    this.notify();
    return true;
  }

  async removePasskey(credentialId: string): Promise<void> {
    this.requireKey();
    await this.exclusive(async () => {
      const record = await this.requireRecord();
      const passkeys = record.passkeys.filter((p) => p.credentialId !== credentialId);
      await this.records.set(recordKey(this.profile), { ...record, passkeys });
    });
    this.notify();
  }

  /** The passkeys that unlock this profile; readable while locked. */
  async passkeys(): Promise<{ credentialId: string; createdAt: string }[]> {
    return ((await this.record())?.passkeys ?? []).map((p: PasskeyWrap) => ({
      credentialId: p.credentialId,
      createdAt: p.createdAt,
    }));
  }

  /** False: the passkey is not one of this profile's (any more). */
  async unlockWithPasskey(
    credentialId: string,
    secret: Uint8Array,
    remember: boolean,
  ): Promise<boolean> {
    const passkey = (await this.record())?.passkeys.find((p) => p.credentialId === credentialId);
    if (!passkey) return false;
    return this.unlockWith(passkey, () => passkeyKey(secret, fromBase64(passkey.salt)), remember);
  }
```

- [ ] **Step 6: The profiles' passkey methods.** Add to `Profiles` in `src/profiles.ts` (imports: `PASSKEY_MESSAGES`, `type PasskeyAuthenticator`, `PasskeyProblem` from `./passkeys.js`):

```ts
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
```

- [ ] **Step 7: Run the tests.**

Run: `pnpm --filter @statewalker/file-mounts.core test`
Expected: PASS (`tests/passkeys.test.ts` 7 tests, and every earlier file).

- [ ] **Step 8: README.** In `packages/file-mounts.core/README.md`:
  - *How to use*, after the profiles code: a short block with `const passkeys = webAuthnPasskeys({ rpName: "Files" });`, `if (await passkeys.available()) await profiles.addPasskey(vault, password, passkeys);` and `const vault = await profiles.unlockWithPasskey(passkeys, remember);`, saying a `PasskeyProblem`'s `message` is what to show.
  - New Internals section **"A passkey unlocks the vault through PRF, and the password stays"**: the PRF secret for the fixed input `statewalker-files vault v1`; HKDF-SHA256 with a random salt per wrap turns it into the wrapping key; the user handle is the profile id and the user name the profile's name, so one *Unlock with a passkey* finds the profile; the password is checked before the prompt (so no orphan passkey); support differs (Chromium with security keys and phones, Safari 18+ with Apple Passwords, Windows Hello only on recent builds, Firefox unclear) and `available()` asks `getClientCapabilities`; an authenticator that registers a passkey without PRF leaves that passkey in its list though it unlocks nothing ("This browser can't use passkeys to unlock; use the password."); removing a passkey from the profile does not delete it from the authenticator, which then answers "This passkey isn't linked to a profile on this browser."; there is no server, so the challenge is random and nothing is verified beyond the PRF secret; keep the password, since a deleted passkey would otherwise lock the person out.

- [ ] **Step 9: Checks and commit.**

```bash
pnpm --filter @statewalker/file-mounts.core typecheck
pnpm --filter @statewalker/file-panels.core test
pnpm biome check --write --unsafe packages/file-mounts.core
git add packages/file-mounts.core
git commit -m "feat(file-mounts.core): unlock a profile with a passkey (WebAuthn PRF)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz"
```

---

### Task 3: The main storage, and archive copies in a project

**Files:**
- Create: `packages/file-mounts.core/src/main-storage.ts`
- Create: `packages/file-mounts.core/src/project-archive.ts`
- Modify: `packages/file-mounts.core/src/mount-settings-file.ts` (`MOUNTS_FILE` → `/.settings/mounts.json`)
- Modify: `packages/file-mounts.core/src/index.ts` (export both new modules)
- Modify: `packages/file-mounts.core/tests/mount-settings-file.test.ts` (the `MOUNTS_FILE` value)
- Modify: `packages/file-mounts.core/README.md` (*How to use*; the damaged-file section's paths; new section on the main storage and archive)
- Create: `packages/file-mounts.core/tests/project-archive.test.ts`

**Interfaces:**
- Consumes: `ProfileData`, `MountConfig`, `loadMountConfigs(files, path)`, `saveMountConfigs(files, configs, path)`; `Profiles` (in the test).
- Produces (exported):
  - `canBeMain(config: Pick<MountConfig, "type">): boolean`
  - `firstProfileData(opfs: boolean): Pick<ProfileData, "mounts" | "main">`
  - `PROJECT_SYSTEM_DIR = "/.settings"`
  - `archiveProfile(project: FilesApi, data: ProfileData, dir?: string): Promise<void>`
  - `interface ProjectArchive { mounts: MountConfig[]; preferences: Record<string, unknown>; problem?: string }`
  - `importProfile(project: FilesApi, dir?: string): Promise<ProjectArchive>`
  - `mergeImported(data: ProfileData, archive: ProjectArchive): ProfileData`

- [ ] **Step 1: Write the failing tests.** Create `tests/project-archive.test.ts`:

```ts
import { readText, writeText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import {
  archiveProfile,
  canBeMain,
  firstProfileData,
  importProfile,
  MemoryStore,
  type MountConfig,
  mergeImported,
  type ProfileData,
  Profiles,
} from "../src/index.js";

const s3: MountConfig = { key: "archive", name: "Archive", type: "s3", config: { bucket: "b" } };
const notes: MountConfig = { key: "notes", name: "Notes", type: "opfs", config: {} };

describe("the main storage", () => {
  it("only browser storage, a local folder or memory can be main", () => {
    expect(canBeMain({ type: "opfs" })).toBe(true);
    expect(canBeMain({ type: "local-folder" })).toBe(true);
    expect(canBeMain({ type: "memory" })).toBe(true);
    expect(canBeMain({ type: "s3" })).toBe(false);
  });

  it("a first profile starts with browser storage as main, or memory without OPFS", () => {
    expect(firstProfileData(true)).toEqual({
      mounts: [{ key: "browser", name: "Browser storage", type: "opfs", config: {} }],
      main: "browser",
    });
    expect(firstProfileData(false).mounts[0]?.type).toBe("memory");
  });
});

describe("archive copies in a project", () => {
  it("writes the mounts and preferences, never the secrets; import reads them back", async () => {
    const vault = await new Profiles({ records: new MemoryStore<unknown>(), iterations: 1000 }).create(
      "Work",
      "pw",
      false,
      { ...firstProfileData(true), preferences: { theme: "dark" } },
    );
    await vault.set("archive/secretAccessKey", "s3cr3t-value");
    await vault.update((d) => ({ ...d, mounts: [...d.mounts, s3] }));
    const project = new MemFilesApi();
    await archiveProfile(project, await vault.read());

    const mounts = await readText(project, "/.settings/mounts.json");
    expect(mounts).toContain("Archive");
    expect(mounts).not.toContain("s3cr3t-value");
    expect(await readText(project, "/.settings/preferences.json")).not.toContain("s3cr3t-value");
    expect(await importProfile(project)).toEqual({
      mounts: [firstProfileData(true).mounts[0], s3],
      preferences: { theme: "dark" },
    });
  });

  it("import keeps what the profile has and adds the rest", () => {
    const data: ProfileData = {
      secrets: { "archive/k": "v" },
      mounts: [{ ...s3, name: "Mine" }],
      main: "archive",
      preferences: { theme: "light" },
    };
    const merged = mergeImported(data, {
      mounts: [s3, notes],
      preferences: { theme: "dark", density: "compact" },
    });
    expect(merged).toEqual({
      secrets: { "archive/k": "v" },
      mounts: [{ ...s3, name: "Mine" }, notes],
      main: "archive",
      preferences: { theme: "light", density: "compact" },
    });
  });

  it("a damaged archive brings in only what can be read, and says what was left out", async () => {
    const project = new MemFilesApi();
    await writeText(
      project,
      "/.settings/mounts.json",
      JSON.stringify([notes, { key: "", name: 1 }]),
    );
    await writeText(project, "/.settings/preferences.json", "{ not json");
    expect(await importProfile(project)).toEqual({
      mounts: [notes],
      preferences: {},
      problem:
        "1 saved storage could not be read and was left out. The archived preferences are damaged; they were left out.",
    });
  });

  it("a project with no archive imports nothing, without a problem", async () => {
    expect(await importProfile(new MemFilesApi())).toEqual({ mounts: [], preferences: {} });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail.**

Run: `pnpm --filter @statewalker/file-mounts.core test -- tests/project-archive.test.ts`
Expected: FAIL — `archiveProfile` is not exported.

- [ ] **Step 3: The main storage.** Create `src/main-storage.ts`:

```ts
// The main storage is the open project: its system folder holds the project's settings. It must
// open before the vault's S3 keys are needed, so S3 cannot be main.
import type { MountConfig } from "./mount-config.js";
import type { ProfileData } from "./secret-vault.js";

export function canBeMain(config: Pick<MountConfig, "type">): boolean {
  return config.type === "opfs" || config.type === "local-folder" || config.type === "memory";
}

/** What a new profile starts with: browser storage as main, or memory where OPFS is missing. */
export function firstProfileData(opfs: boolean): Pick<ProfileData, "mounts" | "main"> {
  return {
    mounts: [{ key: "browser", name: "Browser storage", type: opfs ? "opfs" : "memory", config: {} }],
    main: "browser",
  };
}
```

- [ ] **Step 4: The archive.** Create `src/project-archive.ts`:

```ts
// Archive copies of the profile's mounts and preferences in a project's system folder. The vault
// always wins; the copies are read back only on an explicit import. Secrets never go there.
import type { FilesApi } from "@statewalker/webrun-files";
import { joinPath, readText, writeText } from "@statewalker/webrun-files";
import type { MountConfig } from "./mount-config.js";
import { loadMountConfigs, saveMountConfigs } from "./mount-settings-file.js";
import type { ProfileData } from "./secret-vault.js";

export const PROJECT_SYSTEM_DIR = "/.settings";
const MOUNTS = "mounts.json";
const PREFERENCES = "preferences.json";

export interface ProjectArchive {
  mounts: MountConfig[];
  preferences: Record<string, unknown>;
  problem?: string;
}

export async function archiveProfile(
  project: FilesApi,
  data: ProfileData,
  dir = PROJECT_SYSTEM_DIR,
): Promise<void> {
  await saveMountConfigs(project, data.mounts, joinPath(dir, MOUNTS));
  await writeText(project, joinPath(dir, PREFERENCES), JSON.stringify(data.preferences, null, 2));
}

export async function importProfile(
  project: FilesApi,
  dir = PROJECT_SYSTEM_DIR,
): Promise<ProjectArchive> {
  const { configs, problem } = await loadMountConfigs(project, joinPath(dir, MOUNTS));
  const problems = problem ? [problem] : [];
  let preferences: Record<string, unknown> = {};
  const path = joinPath(dir, PREFERENCES);
  if (await project.exists(path)) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readText(project, path));
    } catch {
      raw = undefined;
    }
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      preferences = raw as Record<string, unknown>;
    } else {
      problems.push("The archived preferences are damaged; they were left out.");
    }
  }
  return {
    mounts: configs,
    preferences,
    ...(problems.length ? { problem: problems.join(" ") } : {}),
  };
}

/** The profile's own mounts and preferences win; the archive only adds what is missing. */
export function mergeImported(data: ProfileData, archive: ProjectArchive): ProfileData {
  const taken = new Set(data.mounts.map((m) => m.key));
  return {
    ...data,
    mounts: [...data.mounts, ...archive.mounts.filter((m) => !taken.has(m.key))],
    preferences: { ...archive.preferences, ...data.preferences },
  };
}
```

Add `export * from "./main-storage.js";` and `export * from "./project-archive.js";` to `src/index.ts`.

- [ ] **Step 5: `MOUNTS_FILE` is the archive file.** In `src/mount-settings-file.ts` set `export const MOUNTS_FILE = "/.settings/mounts.json";`. In `tests/mount-settings-file.test.ts` change the assertion to `expect(MOUNTS_FILE).toBe("/.settings/mounts.json");` (the other uses go through the constant).

- [ ] **Step 6: Run the tests.**

Run: `pnpm --filter @statewalker/file-mounts.core test`
Expected: PASS (`tests/project-archive.test.ts` 6 tests, and every earlier file).

- [ ] **Step 7: README.** In `packages/file-mounts.core/README.md`:
  - *How to use*: the `profiles.create` call gets its fourth argument `firstProfileData(opfsMountType().isAvailable().ok)`; add a short block: after each `vault.update(...)` that changes mounts or preferences, `await archiveProfile(mainFiles, await vault.read())` (where `mainFiles` is the main mount's `FilesApi`), and *Import from this project* is `await vault.update((d) => mergeImported(d, archive))` with `const archive = await importProfile(mainFiles)` (show `archive.problem` when set).
  - New Internals section **"The main storage is the project, and keeps an archive of the profile"**: `canBeMain` (and why S3 cannot be: it is locked until the vault opens, and the project must open first); `firstProfileData`; the two archive files under `/.settings/`, never secrets; the vault wins, import only adds what is missing; a damaged archive file's problem text.
  - The damaged-file section: replace `/.files/mounts.json` and `/.files/mounts.damaged-…` with `/.settings/…`, and say the file is now the project's archive copy.

- [ ] **Step 8: Checks and commit.**

```bash
pnpm --filter @statewalker/file-mounts.core typecheck
pnpm --filter @statewalker/file-panels.core test
pnpm biome check --write --unsafe packages/file-mounts.core
git add packages/file-mounts.core
git commit -m "feat(file-mounts.core): the main storage, and archive copies of the profile in a project

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz"
```
