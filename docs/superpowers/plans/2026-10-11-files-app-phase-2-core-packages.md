# Files app, phase 2: core packages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Files app logic out of the Storybook prototypes into two React-free packages, `@statewalker/file-mounts.core` and `@statewalker/file-panels.core`, add what the prototypes only faked (a real key vault, a mount table, the S3 mount type and connection test, a panel model, change events), and point the prototypes at the packages so the logic lives in one place.

**Architecture:** `file-mounts.core` owns storages: the `Problem` vocabulary, mount configs and S3 settings validation, the mount types (memory, OPFS, local folder, S3), the mount table that composes them into one `FilesApi`, the settings file, the encrypted key vault, and the S3 connection test. `file-panels.core` owns what a panel does with that `FilesApi`: breadcrumb, transfer planning and running, file operations with change events, and a panel model over `explorer.core`'s `FilesListModel`. `apps/ui-protos.app` keeps its React views and demo data and imports the logic from the two packages.

**Tech Stack:** TypeScript (strict), vitest, Biome, tsdown; `@statewalker/webrun-files` (+ `-mem`, `-composite`, `-browser`, `-s3`), `@aws-sdk/client-s3`, `@statewalker/shared-baseclass`, `@statewalker/explorer.core`; WebCrypto; RustFS in Docker for the S3 integration suite.

**Spec:** `docs/superpowers/specs/2026-10-11-files-app-design.md` (phase 2 row of *Phases*; sections *Storage: mounts*, *S3 settings*, *Testing a connection*, *Secrets: the vault*, *Panels*, *Transfers and operations*, *Change events*, *Search, later*, *Errors*, *Testing*).

## Global Constraints

- Work in the worktree `~/sw-migration/work/sandclaw.worktrees/feat-files-core` (branch `feat/files-core`, from `main` at `4fa19ca`). Node: `export PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH`.
- Package names: `@statewalker/file-mounts.core` in `packages/file-mounts.core`, `@statewalker/file-panels.core` in `packages/file-panels.core`. Both `"version": "0.1.0"`, `"private": false`, `"type": "module"`, `"license": "MIT"`, the `exports` / `files` / scripts / `tsdown.config.ts` / `tsconfig.json` shape of `packages/wiki.core` (with `"files": ["dist", "src"]` and tsconfig `include: ["./src", "./tests"]`).
- `.core` packages are React-free: no `react` import anywhere in them.
- File names kebab-case. Tests in `tests/**/*.test.ts`, at public seams only (import from `../src/index.js`, never from internal files), against real implementations (`MemFilesApi`, real WebCrypto, RustFS), never mocks of the code under test.
- Biome forbids non-null assertions (`x!`). Never name a React prop `role`.
- Messages the person sees are the spec's *Errors* table, verbatim: "Wrong access key or secret." · "This computer's clock is off by more than 15 minutes; S3 refuses the request." · "Bucket `name` not found at this endpoint." · "These keys can't list this bucket." / "These keys can't write to this bucket." · "The bucket doesn't allow this site. Add this CORS rule to the bucket:" · "No answer from `endpoint`." · "No answer in 15 seconds." · "Locked: unlock to use the S3 storages." · "Click Reconnect to give access to `folder` again." · "This browser can't open local folders; use Chrome or Edge."
- Vault: AES-GCM-256 data key, wrapped by a PBKDF2-SHA256 key with **600 000** iterations by default; files `vault.key.json` and `secrets.json` in the vault folder; accounts are `<mount key>/<field>`. Tests pass `iterations: 1000` to stay fast.
- Mount creation times out after **15 s** (`createTimeoutMs`, default `15_000`).
- Settings file: `/.files/mounts.json`. Vault folder: `/.files`.
- No publishing: releases only through `sw.mjs`, never `npm publish`; this plan does not release.
- Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz
  ```
- Each task ends green on: `pnpm --filter <package> test`, `pnpm --filter <package> typecheck`, `pnpm biome check --write --unsafe packages/<package>`.

## Decisions made in this plan (deviations from the spec's *Testing* section)

1. **No `webrun-files-tests` conformance suites.** The package is private to the webrun-files workspace and not on npm; `CompositeFilesApi` is already covered by those suites in its own repo. The mount table is tested through its own behaviour instead.
2. **"Denied write" and "CORS" are not produced against RustFS.** RustFS's root keys may do everything, and a restricted user needs IAM setup outside this plan; Node does not enforce CORS. Both outcomes stay covered by the `classifyS3Error` / `runConnectionTest` unit tests (ported in Task 1). RustFS covers: all checks pass, bad keys, missing bucket, unreachable host, read-only skips the write check, files land under the prefix, a cross-storage transfer into S3.
3. **The S3 integration suite is a separate script** (`pnpm --filter @statewalker/file-mounts.core test:integration`), skipped per test when Docker is absent, so `pnpm test` stays fast and Docker-free (the pattern of `webrun-files-s3`).
4. **Non-AWS storages with an empty region sign with `us-east-1`.** The SDK needs a region string; S3-compatible servers (MinIO, RustFS) expect `us-east-1` by default. AWS itself still requires a region in the form (`regionRequired`), so AWS is never silently `us-east-1`.
5. **`readDropped` becomes `importDropped`** (the spec's name) when it moves.
6. **`FileChange` / `FileChanges` live in `file-mounts.core`**, because `MountTable.apply` returns them; `file-panels.core` imports them.

## Review Focus

1. **A wrong password** never changes the vault: `unlock` returns `false` and the state stays `locked`; `changePassword` with a wrong old password returns `false` and every secret still reads back. (Task 2)
2. **Two tabs writing secrets**: two vault instances over the same files, each setting a different account, both secrets survive. (Task 2)
3. **A storage that never answers**: mount creation that hangs is `failed` with "No answer in 15 seconds." after the timeout, and the other mounts still mount. (Task 3)
4. **A damaged `mounts.json`** is not overwritten and does not crash start-up: `loadMountConfigs` returns no configs with a problem saying so, and the file is untouched. (Task 3)
5. **A slow navigation finishing after a newer one** never replaces the newer folder's entries in a panel. (Task 7)

---

### Task 1: `file-mounts.core` — the package, and the prototype's pure logic moved in

**Files:**
- Create: `packages/file-mounts.core/package.json`, `tsconfig.json`, `tsdown.config.ts`, `src/index.ts`
- Create: `packages/file-mounts.core/src/problem.ts` (from `apps/ui-protos.app/src/file-panels/problem.ts`, plus `problemOf` from `src/file-panels/transfer-run.ts`)
- Create: `packages/file-mounts.core/src/mount-config.ts` (from `apps/ui-protos.app/src/file-mounts/mount-config.ts`)
- Create: `packages/file-mounts.core/src/s3-problems.ts` (from `apps/ui-protos.app/src/file-mounts/s3-problems.ts`)
- Create: `packages/file-mounts.core/src/connection-test.ts` (from `apps/ui-protos.app/src/file-mounts/connection-test.ts`)
- Create: `packages/file-mounts.core/src/unavailable-files.ts` (`unavailableFiles` from `apps/ui-protos.app/src/file-panels/demo-storages.ts:127-149`)
- Create: `packages/file-mounts.core/src/changes.ts`
- Modify: `pnpm-workspace.yaml` (catalog)
- Test: `packages/file-mounts.core/tests/mount-settings.test.ts`, `tests/connection-test.test.ts`, `tests/unavailable-files.test.ts`

The prototype files stay in `apps/ui-protos.app` until Task 8; this task copies them.

**Interfaces:**
- Produces (all exported from `src/index.ts`):
  - `type ProblemCause`, `interface Problem`, `class MountUnavailable(mount: string, problem: Problem)`, `problemOf(error: unknown): Problem`
  - `type MountTypeId`, `interface MountConfig`, `type MountStatus`, `interface S3Form`, `type S3PresetId`, `interface S3Preset`, `S3_PRESETS`, `presetById`, `applyPreset`, `keyFromName`, `validateKey`, `normalizeEndpoint`, `normalizePrefix`, `validateS3Form` — signatures exactly as in the prototype file.
  - `type CheckId`, `interface S3ErrorLike`, `corsRule(origin: string): string`, `classifyS3Error(error, ctx)`
  - `interface S3Probe`, `interface ConnectionReport`, `CHECK_LABELS`, `CHECK_ORDER`, `runConnectionTest(probe, form, opts)`, `type ProbeScenario`, `fakeProbe(scenario, delayMs?)`
  - `unavailableFiles(key: string, problem: Problem): FilesApi`
  - `interface FileChange { type: "added" | "updated" | "deleted"; path: string }`, `interface FileChanges { subscribe(listener: (changes: readonly FileChange[]) => void): () => void }`, `interface FileChangesHub extends FileChanges { emit(changes: readonly FileChange[]): void }`, `newFileChanges(): FileChangesHub`

- [ ] **Step 1: Catalog entries.** In `pnpm-workspace.yaml` under `catalog:`, add (keep the list alphabetical):

```yaml
  "@aws-sdk/client-s3": ^3.1100.0
  "@statewalker/webrun-files-s3": ^0.10.3
  fake-indexeddb: ^6.2.5
```

- [ ] **Step 2: Package files.** `packages/file-mounts.core/package.json`:

```json
{
  "name": "@statewalker/file-mounts.core",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "description": "Storages mounted side by side as one FilesApi: local folders, browser storage and S3 buckets, an encrypted key vault, and an S3 connection test that says what is wrong.",
  "bugs": { "url": "https://github.com/statewalker/sandclaw/issues" },
  "homepage": "https://github.com/statewalker/sandclaw/tree/main/packages/file-mounts.core#readme",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/statewalker/sandclaw.git",
    "directory": "packages/file-mounts.core"
  },
  "exports": {
    ".": {
      "source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist", "src"],
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "biome check --write .",
    "format": "biome format --write .",
    "build": "tsdown"
  },
  "dependencies": {
    "@statewalker/webrun-files": "catalog:",
    "@statewalker/webrun-files-composite": "catalog:",
    "@statewalker/webrun-files-mem": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "tsdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`tsconfig.json`: a copy of `packages/wiki.core/tsconfig.json` with `"include": ["./src", "./tests"]`. `tsdown.config.ts`: a copy of `packages/wiki.core/tsdown.config.ts`. Add `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["source", "import", "module", "default"] },
  test: { include: ["tests/**/*.test.ts"], exclude: ["tests/**/*.integration.test.ts"] },
});
```

Run: `pnpm install` (from the repo root). Expected: the new package is linked, lockfile updated.

- [ ] **Step 3: Copy the logic.** Copy the five prototype sources listed under *Files* into `packages/file-mounts.core/src/` with these changes only:
  - `problem.ts`: append `problemOf`, moved verbatim from `transfer-run.ts`:

```ts
export function problemOf(error: unknown): Problem {
  if (error instanceof MountUnavailable) return error.problem;
  return { cause: "unknown", message: error instanceof Error ? error.message : String(error) };
}
```

  - Every `import … from "../file-panels/problem.js"` becomes `from "./problem.js"`.
  - `unavailable-files.ts` holds only `unavailableFiles` (with its `ListOptions` import from `@statewalker/webrun-files` and its two `biome-ignore` comments).

`src/changes.ts`:

```ts
/** One change to the files: what an operation or a mount change did. */
export interface FileChange {
  type: "added" | "updated" | "deleted";
  path: string;
}

/** The one stream of changes: panels refresh from it, an indexer will follow it. */
export interface FileChanges {
  subscribe(listener: (changes: readonly FileChange[]) => void): () => void;
}

export interface FileChangesHub extends FileChanges {
  emit(changes: readonly FileChange[]): void;
}

export function newFileChanges(): FileChangesHub {
  const listeners = new Set<(changes: readonly FileChange[]) => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(changes) {
      if (!changes.length) return;
      for (const listener of [...listeners]) listener(changes);
    },
  };
}
```

`src/index.ts`:

```ts
export * from "./changes.js";
export * from "./connection-test.js";
export * from "./mount-config.js";
export * from "./problem.js";
export * from "./s3-problems.js";
export * from "./unavailable-files.js";
```

- [ ] **Step 4: Move the tests.** Copy from `apps/ui-protos.app/test/file-mounts-logic.test.ts`:
  - the `describe` blocks `mount settings: presets`, `applyPreset`, `keys`, `normalisation`, `validation` → `tests/mount-settings.test.ts`;
  - `connection test` and `classifyS3Error` → `tests/connection-test.test.ts`.

  Replace every import of the prototype modules with `from "../src/index.js"`. Add `tests/unavailable-files.test.ts` and a test of the hub:

```ts
import { describe, expect, it } from "vitest";
import { MountUnavailable, newFileChanges, problemOf, unavailableFiles } from "../src/index.js";

describe("unavailableFiles", () => {
  const problem = { cause: "locked" as const, message: "Locked: unlock to use the S3 storages." };

  it("raises the mount's problem from every operation, listing included", async () => {
    const files = unavailableFiles("archive", problem);
    const listing = async () => {
      for await (const _ of files.list("/")) break;
    };
    await expect(listing()).rejects.toBeInstanceOf(MountUnavailable);
    await expect(files.exists("/a")).rejects.toThrow("Locked: unlock to use the S3 storages.");
    const error = await files.stats("/a").catch((e: unknown) => e);
    expect(problemOf(error)).toEqual(problem);
    expect((error as MountUnavailable).mount).toBe("archive");
  });
});

describe("newFileChanges", () => {
  it("sends each batch to every subscriber until it unsubscribes; empty batches are dropped", () => {
    const hub = newFileChanges();
    const seen: string[][] = [];
    const stop = hub.subscribe((changes) => seen.push(changes.map((c) => `${c.type} ${c.path}`)));
    hub.emit([{ type: "added", path: "/a/x.md" }]);
    hub.emit([]);
    stop();
    hub.emit([{ type: "deleted", path: "/a/x.md" }]);
    expect(seen).toEqual([["added /a/x.md"]]);
  });
});
```

- [ ] **Step 5: Run.** `pnpm --filter @statewalker/file-mounts.core test` — Expected: all moved tests pass (the same count as in the prototype's two `describe` groups, plus 2). Then `typecheck` and `biome check --write --unsafe packages/file-mounts.core` clean.

- [ ] **Step 6: Commit.**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/file-mounts.core
git commit -m "feat(file-mounts.core): the package, with the prototype's mount settings, S3 problems and connection test"
```

---

### Task 2: The key vault

**Files:**
- Create: `packages/file-mounts.core/src/key-value-store.ts`, `src/secret-vault.ts`
- Modify: `packages/file-mounts.core/src/index.ts`, `package.json` (dependencies `@statewalker/shared-baseclass: catalog:`; devDependencies `fake-indexeddb: catalog:`)
- Test: `packages/file-mounts.core/tests/secret-vault.test.ts`, `tests/idb-store.test.ts`

**Interfaces:**
- Consumes: `FilesApi`, `readText`, `writeText` from `@statewalker/webrun-files`; `BaseClass` from `@statewalker/shared-baseclass` (`onUpdate(cb): () => void`, `notify()`).
- Produces:
  - `interface KeyValueStore<T> { get(id: string): Promise<T | undefined>; set(id: string, value: T): Promise<void>; delete(id: string): Promise<void> }`
  - `class MemoryStore<T> implements KeyValueStore<T>`; `class IdbStore<T> implements KeyValueStore<T>` (`constructor(name: string)`, one IndexedDB database per name, object store `entries`)
  - `type VaultState = "absent" | "locked" | "unlocked"`
  - `interface SecretStore` — the spec's interface: `state`, `create(password, remember)`, `unlock(password, remember): Promise<boolean>`, `lock()`, `get(account)`, `set(account, value | undefined)`, `changePassword(old, new): Promise<boolean>`, `forget()`, `reset()`, `onUpdate(listener): () => void`
  - `class SecretsLocked extends Error` (message "Locked: unlock to use the S3 storages.")
  - `class SecretVault extends BaseClass implements SecretStore` with `constructor(opts: { files: FilesApi; dir: string; keys: KeyValueStore<CryptoKey>; iterations?: number })` and `load(): Promise<VaultState>` (reads the files; a remembered key unlocks silently)

- [ ] **Step 1: Write the failing tests.** `tests/secret-vault.test.ts`:

```ts
import { readText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { MemoryStore, SecretVault, SecretsLocked } from "../src/index.js";

const newVault = (files = new MemFilesApi(), keys = new MemoryStore<CryptoKey>()) =>
  new SecretVault({ files, dir: "/.files", keys, iterations: 1000 });

describe("SecretVault", () => {
  it("starts absent, and create unlocks it; secrets round-trip and are not stored in clear", async () => {
    const files = new MemFilesApi();
    const vault = newVault(files);
    expect(await vault.load()).toBe("absent");
    await vault.create("correct horse", false);
    expect(vault.state).toBe("unlocked");
    await vault.set("archive/secretAccessKey", "s3cr3t-value");
    expect(await vault.get("archive/secretAccessKey")).toBe("s3cr3t-value");
    expect(await readText(files, "/.files/secrets.json")).not.toContain("s3cr3t-value");
  });

  it("a fresh instance is locked; the right password unlocks, a wrong one changes nothing", async () => {
    const files = new MemFilesApi();
    const first = newVault(files);
    await first.load();
    await first.create("correct horse", false);
    await first.set("a/k", "v");

    const vault = newVault(files);
    expect(await vault.load()).toBe("locked");
    await expect(vault.get("a/k")).rejects.toBeInstanceOf(SecretsLocked);
    expect(await vault.unlock("wrong", false)).toBe(false);
    expect(vault.state).toBe("locked");
    expect(await vault.unlock("correct horse", false)).toBe(true);
    expect(await vault.get("a/k")).toBe("v");
    vault.lock();
    expect(vault.state).toBe("locked");
  });

  it("remember unlocks silently on the next load; forget stops that", async () => {
    const files = new MemFilesApi();
    const keys = new MemoryStore<CryptoKey>();
    const first = newVault(files, keys);
    await first.load();
    await first.create("correct horse", true);
    expect(await newVault(files, keys).load()).toBe("unlocked");
    await first.forget();
    expect(await newVault(files, keys).load()).toBe("locked");
  });

  it("changePassword: a wrong old password changes nothing; the right one keeps every secret", async () => {
    const files = new MemFilesApi();
    const vault = newVault(files);
    await vault.load();
    await vault.create("old password", false);
    await vault.set("a/k", "v");
    expect(await vault.changePassword("not it", "new password")).toBe(false);
    expect(await vault.changePassword("old password", "new password")).toBe(true);
    const again = newVault(files);
    await again.load();
    expect(await again.unlock("old password", false)).toBe(false);
    expect(await again.unlock("new password", false)).toBe(true);
    expect(await again.get("a/k")).toBe("v");
  });

  it("two tabs writing different secrets keep both", async () => {
    const files = new MemFilesApi();
    const a = newVault(files);
    await a.load();
    await a.create("pw", false);
    const b = newVault(files);
    await b.load();
    await b.unlock("pw", false);
    await a.set("one/k", "1");
    await b.set("two/k", "2");
    expect(await a.get("two/k")).toBe("2");
    expect(await b.get("one/k")).toBe("1");
  });

  it("set(account, undefined) deletes; reset deletes everything and makes it absent", async () => {
    const files = new MemFilesApi();
    const vault = newVault(files);
    await vault.load();
    await vault.create("pw", true);
    await vault.set("a/k", "v");
    await vault.set("a/k", undefined);
    expect(await vault.get("a/k")).toBeUndefined();
    const seen: string[] = [];
    vault.onUpdate(() => seen.push(vault.state));
    await vault.reset();
    expect(vault.state).toBe("absent");
    expect(seen).toContain("absent");
    expect(await files.exists("/.files/vault.key.json")).toBe(false);
    expect(await newVault(files).load()).toBe("absent");
  });

  it("create refuses to replace an existing vault", async () => {
    const vault = newVault();
    await vault.load();
    await vault.create("pw", false);
    await expect(vault.create("other", false)).rejects.toThrow("A key vault already exists.");
  });
});
```

`tests/idb-store.test.ts`:

```ts
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IdbStore } from "../src/index.js";

describe("IdbStore", () => {
  it("keeps values across instances of the same name, and deletes them", async () => {
    await new IdbStore<string>("test-store").set("a", "one");
    const store = new IdbStore<string>("test-store");
    expect(await store.get("a")).toBe("one");
    await store.delete("a");
    expect(await store.get("a")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to see them fail.** `pnpm --filter @statewalker/file-mounts.core test` — Expected: FAIL, `SecretVault` / `IdbStore` not exported.

- [ ] **Step 3: Implement.** `src/key-value-store.ts`:

```ts
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
```

`src/secret-vault.ts`:

```ts
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
  const base = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, [
    "deriveKey",
  ]);
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
```

Export both files from `src/index.ts` (`export * from "./key-value-store.js"; export * from "./secret-vault.js";`).

- [ ] **Step 4: Run.** `pnpm --filter @statewalker/file-mounts.core test` — Expected: PASS (all vault and store tests). Typecheck and Biome clean.

- [ ] **Step 5: Commit.**

```bash
git add packages/file-mounts.core pnpm-lock.yaml
git commit -m "feat(file-mounts.core): key vault — AES-GCM secrets, PBKDF2 password, remembered key"
```

---

### Task 3: Mount types (memory, OPFS, local folder), the mount table, the settings file

**Files:**
- Create: `packages/file-mounts.core/src/mount-type.ts`, `src/memory-mount-type.ts`, `src/opfs-mount-type.ts`, `src/local-folder-mount-type.ts`, `src/mount-table.ts`, `src/mount-settings-file.ts`
- Modify: `src/index.ts`; `package.json` (dependency `@statewalker/webrun-files-browser: catalog:`)
- Test: `packages/file-mounts.core/tests/mount-table.test.ts`, `tests/mount-settings-file.test.ts`, `tests/local-folder-mount-type.test.ts`

**Interfaces:**
- Consumes: `MountConfig`, `MountStatus`, `MountTypeId`, `validateKey` (Task 1), `Problem`, `MountUnavailable`, `problemOf`, `unavailableFiles`, `FileChange` (Task 1), `SecretStore`, `SecretsLocked`, `KeyValueStore` (Task 2); `CompositeFilesApi`, `readOnly` from `@statewalker/webrun-files-composite`; `MemFilesApi`; `BrowserFilesApi` from `@statewalker/webrun-files-browser` (`new BrowserFilesApi({ rootHandle })`).
- Produces:
  - `interface MountField`, `interface MountContext { interactive: boolean; secret(field: string): Promise<string | undefined> }`, `interface MountType { id; label; fields; isAvailable(): { ok: true } | { ok: false; reason: string }; create(mount, ctx): Promise<FilesApi>; forget?(mount): Promise<void> }`, `class NeedsUserGesture extends Error`
  - `memoryMountType(): MountType` (one `MemFilesApi` per key, kept across re-creation)
  - `opfsMountType(): MountType`
  - `localFolderMountType(handles: KeyValueStore<FileSystemDirectoryHandle>): MountType & { pick(): Promise<Record<string, string> | undefined> }`
  - `interface MountTable` (the spec's) and `class FilesMountTable extends BaseClass implements MountTable` with `constructor(opts: { types: MountType[]; secrets: Pick<SecretStore, "state" | "get">; createTimeoutMs?: number })`, `files`, `list()`, `configs(): MountConfig[]`, `apply(configs, opts?: { interactive?: boolean }): Promise<FileChange[]>`, `reconnect(key): Promise<MountStatus>`
  - `MOUNTS_FILE = "/.files/mounts.json"`, `loadMountConfigs(files, path?): Promise<{ configs: MountConfig[]; problem?: string }>`, `saveMountConfigs(files, configs, path?): Promise<void>`

- [ ] **Step 1: Write the failing tests.** `tests/mount-table.test.ts`:

```ts
import { readText, writeText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import {
  FilesMountTable,
  type MountConfig,
  type MountType,
  MountUnavailable,
  memoryMountType,
  NeedsUserGesture,
  problemOf,
} from "../src/index.js";

const unlocked = { state: "unlocked" as const, get: async (a: string) => `secret of ${a}` };
const locked = { state: "locked" as const, get: async () => undefined };
const mem = (key: string, extra: Partial<MountConfig> = {}): MountConfig => ({
  key,
  name: key,
  type: "memory",
  config: {},
  ...extra,
});
const names = async (table: FilesMountTable, path: string) => {
  const out: string[] = [];
  for await (const e of table.files.list(path)) out.push(e.name);
  return out.sort();
};
/** A type for the cases the built-in ones can't reach: secrets, hanging, user gestures. */
const scripted = (create: MountType["create"]): MountType => ({
  id: "s3",
  label: "Scripted",
  fields: [],
  isAvailable: () => ({ ok: true }),
  create,
});

describe("FilesMountTable", () => {
  it("composes the mounts under one root that lists them and refuses writes", async () => {
    const table = new FilesMountTable({ types: [memoryMountType()], secrets: unlocked });
    const changes = await table.apply([mem("docs"), mem("notes")]);
    expect(changes).toEqual([
      { type: "added", path: "/docs" },
      { type: "added", path: "/notes" },
    ]);
    expect(await names(table, "/")).toEqual(["docs", "notes"]);
    await writeText(table.files, "/docs/a.md", "A");
    expect(await readText(table.files, "/docs/a.md")).toBe("A");
    await expect(writeText(table.files, "/loose.md", "x")).rejects.toThrow();
    expect(table.list().map((m) => m.status.state)).toEqual(["mounted", "mounted"]);
  });

  it("apply keeps unchanged mounts (and their files), removes dropped ones, and says so", async () => {
    const table = new FilesMountTable({ types: [memoryMountType()], secrets: unlocked });
    await table.apply([mem("docs"), mem("old")]);
    const files = table.files;
    await writeText(files, "/docs/a.md", "A");
    const changes = await table.apply([mem("docs"), mem("new")]);
    expect(changes).toEqual([
      { type: "deleted", path: "/old" },
      { type: "added", path: "/new" },
    ]);
    expect(table.files).toBe(files);
    expect(await readText(table.files, "/docs/a.md")).toBe("A");
  });

  it("a read-only mount refuses writes", async () => {
    const table = new FilesMountTable({ types: [memoryMountType()], secrets: unlocked });
    await table.apply([mem("ro", { readOnly: true })]);
    await expect(writeText(table.files, "/ro/a.md", "x")).rejects.toThrow();
  });

  it("an unmounted config is remembered but not listed", async () => {
    const table = new FilesMountTable({ types: [memoryMountType()], secrets: unlocked });
    await table.apply([mem("docs"), mem("off", { mounted: false })]);
    expect(await names(table, "/")).toEqual(["docs"]);
    expect(table.list().map((m) => m.status.state)).toEqual(["mounted", "unmounted"]);
  });

  it("secrets come from the vault as <key>/<field>; a locked vault makes the mount Locked", async () => {
    const seen: (string | undefined)[] = [];
    const type = scripted(async (_m, ctx) => {
      seen.push(await ctx.secret("accessKeyId"));
      return new MemFilesApi();
    });
    const open = new FilesMountTable({ types: [type], secrets: unlocked });
    await open.apply([{ key: "archive", name: "Archive", type: "s3", config: {} }]);
    expect(seen).toEqual(["secret of archive/accessKeyId"]);

    const closed = new FilesMountTable({ types: [type], secrets: locked });
    await closed.apply([{ key: "archive", name: "Archive", type: "s3", config: {} }]);
    expect(closed.list()[0]?.status).toEqual({ state: "locked" });
    // Not an empty folder: listing it says why.
    const error = await names(closed, "/archive").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MountUnavailable);
    expect(problemOf(error).message).toBe("Locked: unlock to use the S3 storages.");
  });

  it("a storage that never answers fails after the timeout; the others mount", async () => {
    const hanging = scripted(() => new Promise(() => {}));
    const table = new FilesMountTable({
      types: [hanging, memoryMountType()],
      secrets: unlocked,
      createTimeoutMs: 50,
    });
    await table.apply([{ key: "slow", name: "Slow", type: "s3", config: {} }, mem("docs")]);
    expect(table.list().map((m) => m.status)).toEqual([
      { state: "failed", problem: { cause: "timeout", message: "No answer in 15 seconds." } },
      { state: "mounted" },
    ]);
  });

  it("a failure carrying a Problem keeps it; an unknown type fails with a reason", async () => {
    const refusing = scripted(async (m) => {
      throw new MountUnavailable(m.key, { cause: "no-bucket", message: "Bucket `b` not found at this endpoint." });
    });
    const table = new FilesMountTable({ types: [refusing], secrets: unlocked });
    await table.apply([
      { key: "b", name: "B", type: "s3", config: {} },
      { key: "x", name: "X", type: "opfs", config: {} },
    ]);
    const [b, x] = table.list();
    expect(b?.status).toEqual({
      state: "failed",
      problem: { cause: "no-bucket", message: "Bucket `b` not found at this endpoint." },
    });
    expect(x?.status.state).toBe("failed");
  });

  it("needs-access until reconnect, which runs as a user gesture", async () => {
    const type = scripted(async (_m, ctx) => {
      if (!ctx.interactive) throw new NeedsUserGesture();
      return new MemFilesApi();
    });
    const table = new FilesMountTable({ types: [type], secrets: unlocked });
    const updates: string[] = [];
    table.onUpdate(() => updates.push(table.list()[0]?.status.state ?? ""));
    await table.apply([{ key: "home", name: "Home", type: "s3", config: { directory: "home" } }]);
    expect(table.list()[0]?.status).toEqual({ state: "needs-access" });
    expect(problemOf(await names(table, "/home").catch((e: unknown) => e)).message).toBe(
      "Click Reconnect to give access to home again.",
    );
    expect(await table.reconnect("home")).toEqual({ state: "mounted" });
    expect(await names(table, "/home")).toEqual([]);
    expect(updates.at(-1)).toBe("mounted");
  });
});
```

`tests/mount-settings-file.test.ts`:

```ts
import { readText, writeText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { loadMountConfigs, MOUNTS_FILE, saveMountConfigs } from "../src/index.js";

describe("mounts.json", () => {
  it("no file: no mounts, no problem; save then load round-trips", async () => {
    const files = new MemFilesApi();
    expect(await loadMountConfigs(files)).toEqual({ configs: [] });
    const configs = [
      { key: "archive", name: "Archive", type: "s3" as const, config: { bucket: "b" } },
    ];
    await saveMountConfigs(files, configs);
    expect(await loadMountConfigs(files)).toEqual({ configs });
    expect(MOUNTS_FILE).toBe("/.files/mounts.json");
  });

  it("a damaged file loads as no mounts with a problem, and is left untouched", async () => {
    const files = new MemFilesApi();
    await writeText(files, MOUNTS_FILE, "{ not json");
    const loaded = await loadMountConfigs(files);
    expect(loaded.configs).toEqual([]);
    expect(loaded.problem).toBe("The storage settings file is damaged; it is kept as is until you save.");
    expect(await readText(files, MOUNTS_FILE)).toBe("{ not json");
  });

  it("entries that can't be used are left out and counted", async () => {
    const files = new MemFilesApi();
    await writeText(
      files,
      MOUNTS_FILE,
      JSON.stringify([
        { key: "ok", name: "Ok", type: "memory", config: {} },
        { key: "ok", name: "Twice", type: "memory", config: {} },
        { key: ".hidden", name: "Bad key", type: "memory", config: {} },
        { key: "t", name: "Bad type", type: "ftp", config: {} },
      ]),
    );
    const loaded = await loadMountConfigs(files);
    expect(loaded.configs.map((c) => c.key)).toEqual(["ok"]);
    expect(loaded.problem).toBe("3 saved storages could not be read and were left out.");
  });
});
```

`tests/local-folder-mount-type.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { localFolderMountType, MemoryStore, NeedsUserGesture } from "../src/index.js";

const fakeHandle = (permission: "granted" | "prompt" | "denied", afterRequest = permission) =>
  ({
    kind: "directory",
    name: "Projects",
    queryPermission: async () => permission,
    requestPermission: async () => afterRequest,
  }) as unknown as FileSystemDirectoryHandle;

describe("localFolderMountType", () => {
  const mount = { key: "home", name: "Home", type: "local-folder" as const, config: { handleId: "h1", directory: "Projects" } };

  it("is unavailable without the File System Access API, with the reason to show", () => {
    expect(localFolderMountType(new MemoryStore()).isAvailable()).toEqual({
      ok: false,
      reason: "This browser can't open local folders; use Chrome or Edge.",
    });
  });

  it("without permission: NeedsUserGesture at start-up, a request when the person clicks", async () => {
    const handles = new MemoryStore<FileSystemDirectoryHandle>();
    await handles.set("h1", fakeHandle("prompt", "granted"));
    const type = localFolderMountType(handles);
    await expect(type.create(mount, { interactive: false, secret: async () => undefined })).rejects.toBeInstanceOf(NeedsUserGesture);
    await expect(type.create(mount, { interactive: true, secret: async () => undefined })).resolves.toBeDefined();
  });

  it("a refused request and a forgotten handle each fail with a reason", async () => {
    const handles = new MemoryStore<FileSystemDirectoryHandle>();
    await handles.set("h1", fakeHandle("prompt", "denied"));
    const type = localFolderMountType(handles);
    const ctx = { interactive: true, secret: async () => undefined };
    await expect(type.create(mount, ctx)).rejects.toThrow("Access to Projects was refused.");
    await type.forget?.(mount);
    await expect(type.create(mount, ctx)).rejects.toThrow("This folder was forgotten; choose it again.");
  });
});
```

- [ ] **Step 2: Run to see them fail.** Expected: FAIL, the new exports are missing.

- [ ] **Step 3: Implement.** `src/mount-type.ts`:

```ts
import type { FilesApi } from "@statewalker/webrun-files";
import type { MountConfig, MountTypeId } from "./mount-config.js";

export interface MountField {
  name: string;
  label: string;
  kind: "text" | "secret" | "url" | "boolean" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
  default?: string;
}

export interface MountContext {
  /** A user gesture is available: permission prompts may be shown. */
  interactive: boolean;
  /** A secret field of this mount from the vault; throws SecretsLocked when locked. */
  secret(field: string): Promise<string | undefined>;
}

export interface MountType {
  readonly id: MountTypeId;
  readonly label: string;
  readonly fields: MountField[];
  isAvailable(): { ok: true } | { ok: false; reason: string };
  create(mount: MountConfig, ctx: MountContext): Promise<FilesApi>;
  /** Drops what the type stored for the mount (a folder handle). */
  forget?(mount: MountConfig): Promise<void>;
}

/** The folder needs a click to grant access again (after a reload). */
export class NeedsUserGesture extends Error {
  constructor() {
    super("A click is needed to give access again.");
    this.name = "NeedsUserGesture";
  }
}
```

`src/memory-mount-type.ts`:

```ts
import type { FilesApi } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import type { MountType } from "./mount-type.js";

/** In-memory storages for tests and demos; a key keeps its files when re-created. */
export function memoryMountType(): MountType {
  const stores = new Map<string, FilesApi>();
  return {
    id: "memory",
    label: "Memory",
    fields: [],
    isAvailable: () => ({ ok: true }),
    async create(mount) {
      let files = stores.get(mount.key);
      if (!files) stores.set(mount.key, (files = new MemFilesApi()));
      return files;
    },
  };
}
```

`src/opfs-mount-type.ts`:

```ts
import { BrowserFilesApi } from "@statewalker/webrun-files-browser";
import type { MountType } from "./mount-type.js";

/** Browser storage (OPFS): each mount is the folder `mounts/<key>` of the page's private storage. */
export function opfsMountType(): MountType {
  return {
    id: "opfs",
    label: "Browser storage",
    fields: [],
    isAvailable: () =>
      typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function"
        ? { ok: true }
        : { ok: false, reason: "This browser has no storage for web pages." },
    async create(mount) {
      const root = await navigator.storage.getDirectory();
      const mounts = await root.getDirectoryHandle("mounts", { create: true });
      const rootHandle = await mounts.getDirectoryHandle(mount.key, { create: true });
      return new BrowserFilesApi({ rootHandle });
    },
  };
}
```

`src/local-folder-mount-type.ts`:

```ts
import { BrowserFilesApi } from "@statewalker/webrun-files-browser";
import type { KeyValueStore } from "./key-value-store.js";
import { type MountType, NeedsUserGesture } from "./mount-type.js";
import { MountUnavailable } from "./problem.js";

// Permission calls are not in TypeScript's DOM types yet.
interface PermissionHandle {
  name: string;
  queryPermission(opts: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(opts: { mode: "readwrite" }): Promise<PermissionState>;
}
type DirectoryPicker = (opts: { mode: "readwrite" }) => Promise<FileSystemDirectoryHandle>;
const picker = () =>
  (globalThis as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;

/**
 * A folder of the computer (File System Access API, Chromium only). The handle
 * is kept in `handles` under `config.handleId`; after a reload only a click
 * may ask for access again.
 */
export function localFolderMountType(
  handles: KeyValueStore<FileSystemDirectoryHandle>,
): MountType & { pick(): Promise<Record<string, string> | undefined> } {
  return {
    id: "local-folder",
    label: "Local folder",
    fields: [],
    isAvailable: () =>
      picker()
        ? { ok: true }
        : { ok: false, reason: "This browser can't open local folders; use Chrome or Edge." },

    /** Asks the person for a folder; the config to save, or undefined when they cancel. */
    async pick() {
      const show = picker();
      if (!show) return undefined;
      let handle: FileSystemDirectoryHandle;
      try {
        handle = await show({ mode: "readwrite" });
      } catch {
        return undefined;
      }
      const handleId = crypto.randomUUID();
      await handles.set(handleId, handle);
      return { directory: handle.name, handleId };
    },

    async create(mount, ctx) {
      const handle = await handles.get(mount.config.handleId ?? "");
      if (!handle) {
        throw new MountUnavailable(mount.key, {
          cause: "invalid-settings",
          message: "This folder was forgotten; choose it again.",
        });
      }
      const access = handle as unknown as PermissionHandle;
      let permission = await access.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        if (!ctx.interactive) throw new NeedsUserGesture();
        permission = await access.requestPermission({ mode: "readwrite" });
      }
      if (permission !== "granted") {
        throw new MountUnavailable(mount.key, {
          cause: "needs-access",
          message: `Access to ${handle.name} was refused.`,
        });
      }
      return new BrowserFilesApi({ rootHandle: handle });
    },

    async forget(mount) {
      await handles.delete(mount.config.handleId ?? "");
    },
  };
}
```

`src/mount-table.ts`:

```ts
// The mounts composed into one FilesApi: each storage at /<key>, under a
// read-only root that lists them. A mount that can't be used stays in the table
// with its status, and reading it raises MountUnavailable with the reason.
import { BaseClass } from "@statewalker/shared-baseclass";
import type { FilesApi } from "@statewalker/webrun-files";
import { CompositeFilesApi, readOnly } from "@statewalker/webrun-files-composite";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import type { FileChange } from "./changes.js";
import type { MountConfig, MountStatus } from "./mount-config.js";
import { type MountType, NeedsUserGesture } from "./mount-type.js";
import { MountUnavailable, type Problem, problemOf } from "./problem.js";
import { type SecretStore, SecretsLocked } from "./secret-vault.js";
import { unavailableFiles } from "./unavailable-files.js";

export interface MountTable {
  readonly files: FilesApi;
  list(): { config: MountConfig; status: MountStatus }[];
  apply(configs: MountConfig[]): Promise<FileChange[]>;
  reconnect(key: string): Promise<MountStatus>;
  onUpdate(listener: () => void): () => void;
}

interface Entry {
  config: MountConfig;
  status: MountStatus;
  api: FilesApi;
}

class TimedOut extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimedOut()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const canonical = (c: MountConfig) =>
  JSON.stringify([
    c.type,
    Object.entries(c.config).sort(([a], [b]) => a.localeCompare(b)),
    Boolean(c.readOnly),
    c.mounted !== false,
  ]);

/** A FilesApi whose target can be swapped: the table's `files` stays the same object. */
function switchable(initial: FilesApi) {
  let current = initial;
  const api: FilesApi = {
    read: (p, o) => current.read(p, o),
    write: (p, c) => current.write(p, c),
    mkdir: (p) => current.mkdir(p),
    list: (p, o) => current.list(p, o),
    stats: (p) => current.stats(p),
    exists: (p) => current.exists(p),
    remove: (p) => current.remove(p),
    move: (a, b) => current.move(a, b),
    copy: (a, b) => current.copy(a, b),
  };
  return { api, set: (next: FilesApi) => (current = next) };
}

const emptyRoot = () => readOnly(new MemFilesApi());

function problemFor(config: MountConfig, status: MountStatus): Problem | undefined {
  switch (status.state) {
    case "locked":
      return { cause: "locked", message: "Locked: unlock to use the S3 storages." };
    case "needs-access":
      return {
        cause: "needs-access",
        message: `Click Reconnect to give access to ${config.config.directory ?? config.name} again.`,
      };
    case "failed":
      return status.problem;
    default:
      return undefined;
  }
}

export class FilesMountTable extends BaseClass implements MountTable {
  readonly files: FilesApi;
  private readonly root = switchable(emptyRoot());
  private entries: Entry[] = [];
  private readonly types: Map<string, MountType>;
  private readonly secrets: Pick<SecretStore, "state" | "get">;
  private readonly createTimeoutMs: number;

  constructor(opts: {
    types: MountType[];
    secrets: Pick<SecretStore, "state" | "get">;
    createTimeoutMs?: number;
  }) {
    super();
    this.types = new Map(opts.types.map((t) => [t.id, t]));
    this.secrets = opts.secrets;
    this.createTimeoutMs = opts.createTimeoutMs ?? 15_000;
    this.files = this.root.api;
  }

  list() {
    return this.entries.map(({ config, status }) => ({ config, status }));
  }

  configs(): MountConfig[] {
    return this.entries.map((e) => e.config);
  }

  /** Keeps unchanged mounted storages, (re)creates the others; call again after an unlock. */
  async apply(configs: MountConfig[], opts: { interactive?: boolean } = {}): Promise<FileChange[]> {
    const before = new Map(this.entries.map((e) => [e.config.key, e]));
    const next: Entry[] = [];
    for (const config of configs) {
      const old = before.get(config.key);
      const keep =
        old && old.status.state === "mounted" && canonical(old.config) === canonical(config);
      next.push(keep ? { ...old, config } : await this.create(config, opts.interactive ?? false));
    }
    const changes: FileChange[] = [];
    const after = new Set(next.map((e) => e.config.key));
    for (const key of before.keys()) {
      if (!after.has(key)) changes.push({ type: "deleted", path: `/${key}` });
    }
    for (const entry of next) {
      const old = before.get(entry.config.key);
      if (!old) changes.push({ type: "added", path: `/${entry.config.key}` });
      else if (old.api !== entry.api) changes.push({ type: "updated", path: `/${entry.config.key}` });
    }
    this.entries = next;
    this.recompose();
    return changes;
  }

  /** Inside a click: asks for access again (local folder) or retries a failed mount. */
  async reconnect(key: string): Promise<MountStatus> {
    const at = this.entries.findIndex((e) => e.config.key === key);
    const entry = this.entries[at];
    if (!entry) return { state: "unmounted" };
    const created = await this.create(entry.config, true);
    this.entries = this.entries.map((e, i) => (i === at ? created : e));
    this.recompose();
    return created.status;
  }

  private async create(config: MountConfig, interactive: boolean): Promise<Entry> {
    const failed = (problem: Problem): Entry => this.unusable(config, { state: "failed", problem });
    if (config.mounted === false) return this.unusable(config, { state: "unmounted" });
    const type = this.types.get(config.type);
    if (!type) {
      return failed({ cause: "invalid-settings", message: `Unknown storage type: ${config.type}.` });
    }
    const available = type.isAvailable();
    if (!available.ok) return failed({ cause: "invalid-settings", message: available.reason });
    const ctx = {
      interactive,
      secret: async (field: string) => {
        if (this.secrets.state !== "unlocked") throw new SecretsLocked();
        return this.secrets.get(`${config.key}/${field}`);
      },
    };
    try {
      const api = await withTimeout(type.create(config, ctx), this.createTimeoutMs);
      return { config, status: { state: "mounted" }, api: config.readOnly ? readOnly(api) : api };
    } catch (error) {
      if (error instanceof SecretsLocked) return this.unusable(config, { state: "locked" });
      if (error instanceof NeedsUserGesture) return this.unusable(config, { state: "needs-access" });
      if (error instanceof TimedOut) {
        return failed({ cause: "timeout", message: "No answer in 15 seconds." });
      }
      if (error instanceof MountUnavailable) return failed(error.problem);
      return failed(problemOf(error));
    }
  }

  private unusable(config: MountConfig, status: MountStatus): Entry {
    const problem = problemFor(config, status);
    return { config, status, api: unavailableFiles(config.key, problem ?? { cause: "unknown", message: "" }) };
  }

  private recompose() {
    const root = new CompositeFilesApi(emptyRoot());
    for (const entry of this.entries) {
      if (entry.status.state !== "unmounted") root.mount(`/${entry.config.key}`, entry.api);
    }
    this.root.set(root);
    this.notify();
  }
}
```

The timeout message names 15 seconds per the spec's *Errors* table even when a test passes a shorter `createTimeoutMs`.

`src/mount-settings-file.ts`:

```ts
import type { FilesApi } from "@statewalker/webrun-files";
import { readText, writeText } from "@statewalker/webrun-files";
import { type MountConfig, type MountTypeId, validateKey } from "./mount-config.js";

export const MOUNTS_FILE = "/.files/mounts.json";
const TYPES: MountTypeId[] = ["local-folder", "opfs", "s3", "memory"];

function asConfig(raw: unknown, taken: string[]): MountConfig | undefined {
  const c = raw as Partial<MountConfig> | null;
  if (typeof c?.key !== "string" || validateKey(c.key, taken)) return undefined;
  if (typeof c.name !== "string" || !TYPES.includes(c.type as MountTypeId)) return undefined;
  if (typeof c.config !== "object" || c.config === null) return undefined;
  if (!Object.values(c.config).every((v) => typeof v === "string")) return undefined;
  return {
    key: c.key,
    name: c.name,
    type: c.type as MountTypeId,
    config: c.config,
    ...(c.readOnly ? { readOnly: true } : {}),
    ...(c.mounted === false ? { mounted: false } : {}),
  };
}

/** The saved mounts. A damaged file loads as none, with a problem, and is never rewritten here. */
export async function loadMountConfigs(
  files: FilesApi,
  path = MOUNTS_FILE,
): Promise<{ configs: MountConfig[]; problem?: string }> {
  if (!(await files.exists(path))) return { configs: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(await readText(files, path));
  } catch {
    raw = undefined;
  }
  if (!Array.isArray(raw)) {
    return {
      configs: [],
      problem: "The storage settings file is damaged; it is kept as is until you save.",
    };
  }
  const configs: MountConfig[] = [];
  for (const item of raw) {
    const config = asConfig(item, configs.map((c) => c.key));
    if (config) configs.push(config);
  }
  const lost = raw.length - configs.length;
  return lost
    ? { configs, problem: `${lost} saved storages could not be read and were left out.` }
    : { configs };
}

export async function saveMountConfigs(files: FilesApi, configs: MountConfig[], path = MOUNTS_FILE) {
  await writeText(files, path, JSON.stringify(configs, null, 2));
}
```

Check before using it that the prototype's `validateKey(key, taken)` refuses a duplicate key and a key starting with `.`; the test above relies on both.

Export the six files from `src/index.ts`. Add `@statewalker/shared-baseclass` and `@statewalker/webrun-files-browser` to `dependencies` if not already there.

- [ ] **Step 4: Run.** Expected: PASS; typecheck and Biome clean.

- [ ] **Step 5: Commit.**

```bash
git add packages/file-mounts.core pnpm-lock.yaml
git commit -m "feat(file-mounts.core): mount table over memory, browser storage and local folders; mounts.json"
```

---

### Task 4: S3 — the mount type, the real connection test, the RustFS suite, and the README

**Files:**
- Create: `packages/file-mounts.core/src/s3.ts`, `README.md`, `vitest.integration.config.ts`
- Create: `packages/file-mounts.core/tests/integration/rustfs.ts`, `tests/integration/s3.integration.test.ts`
- Modify: `src/index.ts`; `package.json` (dependencies `@aws-sdk/client-s3: catalog:`, `@statewalker/webrun-files-s3: catalog:`)
- Test: `tests/s3-settings.test.ts`

**Interfaces:**
- Consumes: `S3Probe`, `runConnectionTest`, `ConnectionReport` (Task 1), `classifyS3Error`, `CheckId` (Task 1), `MountType`, `MountContext` (Task 3), `MountUnavailable`.
- Produces:
  - `interface S3Settings { endpoint: string; region: string; bucket: string; prefix: string; pathStyle: boolean }`, `s3Settings(config: Record<string, string>): S3Settings`
  - `interface S3Keys { accessKeyId: string; secretAccessKey: string }`
  - `newS3Probe(settings: S3Settings, keys: S3Keys, opts: { mountKey: string; fetch?: typeof fetch }): S3Probe`
  - `testConnection(mount: MountConfig, keys: S3Keys, opts: { origin: string; signal?: AbortSignal; timeoutMs?: number; fetch?: typeof fetch }): Promise<ConnectionReport>`
  - `s3MountType(opts?: { origin?: string }): MountType`

- [ ] **Step 1: Write the failing unit test.** `tests/s3-settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { s3Settings, testConnection } from "../src/index.js";

describe("s3Settings", () => {
  it("reads a mount's config; path-style unless switched off", () => {
    expect(
      s3Settings({ endpoint: "https://s3.example.com", region: "eu-west-3", bucket: "b", prefix: "a/b/" }),
    ).toEqual({ endpoint: "https://s3.example.com", region: "eu-west-3", bucket: "b", prefix: "a/b/", pathStyle: true });
    expect(s3Settings({ endpoint: "e", bucket: "b", pathStyle: "false" }).pathStyle).toBe(false);
  });
});

describe("testConnection", () => {
  it("a host that does not answer is unreachable, not CORS", async () => {
    const report = await testConnection(
      { key: "x", name: "X", type: "s3", config: { endpoint: "http://127.0.0.1:1", bucket: "b" } },
      { accessKeyId: "k", secretAccessKey: "s" },
      { origin: "https://files.example", timeoutMs: 5000 },
    );
    expect(report.ok).toBe(false);
    expect(report.checks[0]).toMatchObject({ id: "endpoint", state: "failed" });
    expect(report.problem).toMatchObject({ cause: "unreachable", message: "No answer from http://127.0.0.1:1." });
  });
});
```

- [ ] **Step 2: Run to see it fail.** Expected: FAIL, `s3Settings` not exported.

- [ ] **Step 3: Implement `src/s3.ts`.**

```ts
// S3 storages: the client settings, the mount type, and the probe behind the
// five-step connection test. Called straight from the browser, so the bucket
// needs a CORS rule naming the page's address.
import {
  DeleteObjectCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { S3FilesApi } from "@statewalker/webrun-files-s3";
import { type ConnectionReport, runConnectionTest, type S3Probe } from "./connection-test.js";
import type { MountConfig } from "./mount-config.js";
import type { MountType } from "./mount-type.js";
import { MountUnavailable } from "./problem.js";
import { classifyS3Error } from "./s3-problems.js";

export interface S3Settings {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  pathStyle: boolean;
}
export interface S3Keys {
  accessKeyId: string;
  secretAccessKey: string;
}

export function s3Settings(config: Record<string, string>): S3Settings {
  return {
    endpoint: config.endpoint ?? "",
    region: config.region ?? "",
    bucket: config.bucket ?? "",
    prefix: config.prefix ?? "",
    pathStyle: config.pathStyle !== "false",
  };
}

// The SDK needs a region to sign; S3-compatible servers expect us-east-1 when
// none is set. AWS itself always has one (the form requires it).
const newClient = (s: S3Settings, keys: S3Keys) =>
  new S3Client({
    endpoint: s.endpoint,
    region: s.region || "us-east-1",
    forcePathStyle: s.pathStyle,
    credentials: keys,
  });

const AUTH_ERRORS = new Set(["InvalidAccessKeyId", "SignatureDoesNotMatch", "RequestTimeTooSkewed"]);
const statusOf = (e: unknown) => (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
const nameOf = (e: unknown) => (e as { name?: string })?.name ?? "";

/**
 * An error with no HTTP answer behind it is a network failure. The browser
 * reports those as "TypeError: Failed to fetch"; Node reports ECONNREFUSED and
 * the like. Both become the browser's form, so classification treats them alike.
 */
function asNetworkError(error: unknown): unknown {
  if (statusOf(error) !== undefined || AUTH_ERRORS.has(nameOf(error))) return error;
  if (nameOf(error) === "TimeoutError" || nameOf(error) === "AbortError") return error;
  const network = new TypeError("Failed to fetch");
  (network as { cause?: unknown }).cause = error;
  return network;
}

export function newS3Probe(
  settings: S3Settings,
  keys: S3Keys,
  opts: { mountKey: string; fetch?: typeof fetch },
): S3Probe {
  const client = newClient(settings, keys);
  const Bucket = settings.bucket;
  const prefix = settings.prefix.replace(/^\/+/, "");
  // One signed call answers two checks: does the endpoint answer, are the keys
  // accepted. AccessDenied there still means the keys were authenticated.
  let authOutcome: Promise<unknown> | undefined;
  const listBuckets = () =>
    (authOutcome ??= client.send(new ListBucketsCommand({})).then(
      () => undefined,
      (e: unknown) => e,
    ));
  const send = async (command: Parameters<S3Client["send"]>[0]) => {
    try {
      await client.send(command);
    } catch (e) {
      throw asNetworkError(e);
    }
  };
  return {
    async hostAnswers() {
      try {
        await (opts.fetch ?? fetch)(settings.endpoint, { mode: "no-cors" });
        return true;
      } catch {
        return false;
      }
    },
    async check(id) {
      switch (id) {
        case "endpoint": {
          const e = await listBuckets();
          if (e !== undefined && statusOf(e) === undefined && !AUTH_ERRORS.has(nameOf(e))) {
            throw asNetworkError(e);
          }
          return;
        }
        case "keys": {
          const e = await listBuckets();
          if (e !== undefined && AUTH_ERRORS.has(nameOf(e))) throw e;
          return;
        }
        case "bucket":
          try {
            await client.send(new HeadBucketCommand({ Bucket }));
          } catch (e) {
            if (statusOf(e) === 404) {
              throw { name: "NoSuchBucket", message: `${Bucket} does not exist.` };
            }
            if (statusOf(e) === 403) return; // it exists; listing says whether it may be read
            throw asNetworkError(e);
          }
          return;
        case "list":
          await send(new ListObjectsV2Command({ Bucket, Prefix: prefix, MaxKeys: 1 }));
          return;
        case "write": {
          const Key = `${prefix}.${opts.mountKey}-write-test-${crypto.randomUUID()}`;
          await send(new PutObjectCommand({ Bucket, Key, Body: "" }));
          await send(new DeleteObjectCommand({ Bucket, Key }));
          return;
        }
      }
    },
  };
}

/** The five checks against a real bucket; the report the settings form shows. */
export function testConnection(
  mount: MountConfig,
  keys: S3Keys,
  opts: { origin: string; signal?: AbortSignal; timeoutMs?: number; fetch?: typeof fetch },
): Promise<ConnectionReport> {
  const settings = s3Settings(mount.config);
  const probe = newS3Probe(settings, keys, { mountKey: mount.key, fetch: opts.fetch });
  return runConnectionTest(
    probe,
    { endpoint: settings.endpoint, bucket: settings.bucket, readOnly: Boolean(mount.readOnly) },
    opts,
  );
}

export function s3MountType(opts: { origin?: string } = {}): MountType {
  return {
    id: "s3",
    label: "S3 bucket",
    fields: [
      { name: "endpoint", label: "Endpoint", kind: "url", required: true },
      { name: "region", label: "Region", kind: "text" },
      { name: "bucket", label: "Bucket", kind: "text", required: true },
      { name: "prefix", label: "Prefix", kind: "text" },
      { name: "pathStyle", label: "Path-style addressing", kind: "boolean", default: "true" },
      { name: "accessKeyId", label: "Access key ID", kind: "secret", required: true },
      { name: "secretAccessKey", label: "Secret access key", kind: "secret", required: true },
    ],
    isAvailable: () => ({ ok: true }),
    async create(mount, ctx) {
      const accessKeyId = await ctx.secret("accessKeyId");
      const secretAccessKey = await ctx.secret("secretAccessKey");
      if (!accessKeyId || !secretAccessKey) {
        throw new MountUnavailable(mount.key, {
          cause: "invalid-settings",
          message: "Enter the keys for this storage in Settings → Storage.",
        });
      }
      const settings = s3Settings(mount.config);
      const client = newClient(settings, { accessKeyId, secretAccessKey });
      const api = new S3FilesApi({
        client,
        bucket: settings.bucket,
        prefix: settings.prefix || undefined,
      });
      // One listing now, so wrong keys, a missing bucket or CORS show as the
      // mount's status rather than as an empty folder later.
      try {
        for await (const _ of api.list("/")) break;
      } catch (e) {
        throw new MountUnavailable(
          mount.key,
          classifyS3Error(asNetworkError(e), {
            check: "list",
            endpoint: settings.endpoint,
            bucket: settings.bucket,
            origin: opts.origin ?? globalThis.location?.origin ?? "",
          }),
        );
      }
      return api;
    },
  };
}
```

Export from `src/index.ts`: `export * from "./s3.js";`.

- [ ] **Step 4: Run the unit test.** Expected: PASS.

- [ ] **Step 5: The RustFS harness.** `vitest.integration.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["source", "import", "module", "default"] },
  test: {
    include: ["tests/**/*.integration.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
```

`tests/integration/rustfs.ts`:

```ts
import { execFileSync } from "node:child_process";
import { CreateBucketCommand, ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";

const IMAGE = process.env.RUSTFS_IMAGE ?? "rustfs/rustfs:1.0.0";
const KEYS = { accessKeyId: "rustfsadmin", secretAccessKey: "rustfsadmin" };

export function hasDocker(): boolean {
  try {
    execFileSync("docker", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** A RustFS container on a free local port, with one bucket. */
export async function startRustFs(bucket = "files-core") {
  const name = `file-mounts-core-${process.pid}-${Date.now()}`;
  execFileSync("docker", [
    "run", "-d", "--rm", "--name", name,
    "-p", "127.0.0.1::9000",
    "-e", `RUSTFS_ACCESS_KEY=${KEYS.accessKeyId}`,
    "-e", `RUSTFS_SECRET_KEY=${KEYS.secretAccessKey}`,
    "-e", "RUSTFS_VOLUMES=/data",
    IMAGE,
  ]);
  const stop = () => execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
  try {
    const port = execFileSync("docker", ["port", name, "9000/tcp"]).toString().trim().split(":").pop();
    const endpoint = `http://127.0.0.1:${port}`;
    const client = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: KEYS });
    for (let tries = 0; ; tries++) {
      try {
        await client.send(new ListBucketsCommand({}));
        break;
      } catch (e) {
        if (tries > 120) throw e;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    return { endpoint, bucket, keys: KEYS, client, stop };
  } catch (e) {
    stop();
    throw e;
  }
}
```

(Biome will reformat the `docker run` argument array; keep its result.)

- [ ] **Step 6: The integration tests.** `tests/integration/s3.integration.test.ts`:

```ts
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { readText, writeText } from "@statewalker/webrun-files";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FilesMountTable,
  type MountConfig,
  memoryMountType,
  s3MountType,
  testConnection,
} from "../../src/index.js";
import { hasDocker, startRustFs } from "./rustfs.js";

const docker = hasDocker();

describe.skipIf(!docker)("S3 against RustFS", () => {
  let s3: Awaited<ReturnType<typeof startRustFs>>;
  const origin = "https://files.example";
  const mount = (config: Partial<Record<string, string>> = {}, extra: Partial<MountConfig> = {}): MountConfig => ({
    key: "archive",
    name: "Archive",
    type: "s3",
    config: { endpoint: s3.endpoint, bucket: s3.bucket, ...config } as Record<string, string>,
    ...extra,
  });

  beforeAll(async () => {
    s3 = await startRustFs();
  });
  afterAll(() => s3?.stop());

  it("every check passes with the right settings", async () => {
    const report = await testConnection(mount(), s3.keys, { origin });
    expect(report.problem).toBeUndefined();
    expect(report.checks.map((c) => c.state)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
  });

  it("read-only skips the write check", async () => {
    const report = await testConnection(mount({}, { readOnly: true }), s3.keys, { origin });
    expect(report.ok).toBe(true);
    expect(report.checks.at(-1)).toMatchObject({ id: "write", state: "skipped" });
  });

  it("wrong keys fail the keys check: Wrong access key or secret.", async () => {
    const report = await testConnection(mount(), { accessKeyId: "nobody", secretAccessKey: "nothing" }, { origin });
    expect(report.checks.find((c) => c.state === "failed")?.id).toBe("keys");
    expect(report.problem).toMatchObject({ cause: "bad-keys", message: "Wrong access key or secret." });
  });

  it("a missing bucket fails the bucket check", async () => {
    const report = await testConnection(mount({ bucket: "no-such-bucket" }), s3.keys, { origin });
    expect(report.checks.find((c) => c.state === "failed")?.id).toBe("bucket");
    expect(report.problem).toMatchObject({ cause: "no-bucket", message: "Bucket `no-such-bucket` not found at this endpoint." });
  });

  it("a mount writes under its prefix, and a transfer between storages works", async () => {
    const secrets = new Map([["archive/accessKeyId", s3.keys.accessKeyId], ["archive/secretAccessKey", s3.keys.secretAccessKey]]);
    const table = new FilesMountTable({
      types: [s3MountType({ origin }), memoryMountType()],
      secrets: { state: "unlocked", get: async (a) => secrets.get(a) },
    });
    await table.apply([
      mount({ prefix: "team/" }),
      { key: "local", name: "Local", type: "memory", config: {} },
    ]);
    expect(table.list().map((m) => m.status.state)).toEqual(["mounted", "mounted"]);
    await writeText(table.files, "/local/report.md", "# Report");
    await table.files.copy("/local/report.md", "/archive/2026/report.md");
    expect(await readText(table.files, "/archive/2026/report.md")).toBe("# Report");
    const listed = await s3.client.send(new ListObjectsV2Command({ Bucket: s3.bucket }));
    expect(listed.Contents?.map((o) => o.Key)).toContain("team/2026/report.md");
  });

  it("a mount with wrong keys is failed with the reason, not an empty folder", async () => {
    const table = new FilesMountTable({
      types: [s3MountType({ origin })],
      secrets: { state: "unlocked", get: async () => "wrong" },
    });
    await table.apply([mount()]);
    expect(table.list()[0]?.status).toMatchObject({ state: "failed", problem: { cause: "bad-keys" } });
  });
});
```

Note: `CompositeFilesApi.copy` across mounts — if it refuses a cross-mount copy, replace that line with streaming `table.files.read` into `table.files.write` (the runner's way). Record which in the report.

- [ ] **Step 7: Run.** `pnpm --filter @statewalker/file-mounts.core test:integration` — Expected: PASS (Docker present: `rustfs/rustfs:1.0.0` is pulled locally). If RustFS answers wrong keys with a name other than `InvalidAccessKeyId` / `SignatureDoesNotMatch`, report the actual name instead of changing the test; that is a finding about `classifyS3Error`. Then `pnpm --filter @statewalker/file-mounts.core test` (unit suite still Docker-free) and typecheck/Biome.

- [ ] **Step 8: README.** `packages/file-mounts.core/README.md`, package shape per the README rules (What it is · Why it exists · How to use · Examples · Internals · License), headings as claims. It must cover:
  - mounts composed into one `FilesApi` under a read-only root, and why an unusable mount raises `MountUnavailable` instead of being empty;
  - the mount types and what each needs (Chromium for local folders, a click after reload, OPFS folder `mounts/<key>`);
  - the vault's crypto (AES-GCM data key, PBKDF2-SHA256 600 000 iterations, the two files, *remember*, Web Locks) and what a lost password means (Reset deletes the keys, never the files);
  - the five connection checks, why a network failure is followed by a no-cors request (CORS vs unreachable), the CORS rule naming the page's address, and why non-AWS storages sign with `us-east-1`;
  - `mounts.json`: a damaged file is never overwritten until the person saves;
  - the failure messages, verbatim, next to the features;
  - how to run the RustFS suite (`pnpm --filter @statewalker/file-mounts.core test:integration`, Docker required, `RUSTFS_IMAGE` to override);
  - dependencies and why; License: MIT.
  Every command in it is run before committing.

- [ ] **Step 9: Commit.**

```bash
git add packages/file-mounts.core pnpm-lock.yaml
git commit -m "feat(file-mounts.core): S3 storages — mount type, five-step connection test, RustFS suite; README"
```

---

### Task 5: `file-panels.core` — the package, and the prototype's panel logic moved in

**Files:**
- Create: `packages/file-panels.core/package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, `src/index.ts`
- Create: `packages/file-panels.core/src/paths.ts` (`Crumb`, `breadcrumb`, `siblings` from `apps/ui-protos.app/src/file-panels/paths.ts`; not `sortEntries` / `clickSelect`, which stay with the prototype views)
- Create: `src/transfer-plan.ts`, `src/transfer-run.ts` (from the prototype, `problemOf` now imported from `@statewalker/file-mounts.core`)
- Create: `src/import-dropped.ts` (from `src/file-panels/dropped-files.ts`, `readDropped` renamed `importDropped`)
- Create: `src/search.ts`
- Test: `tests/paths.test.ts`, `tests/transfer.test.ts`, `tests/import-dropped.test.ts`

**Interfaces:**
- Consumes: `Problem`, `MountUnavailable`, `problemOf`, `unavailableFiles` from `@statewalker/file-mounts.core`.
- Produces: `Crumb`, `breadcrumb(path, mountNames)`, `siblings(files, crumb)`; `TransferOp`, `ClashPolicy`, `TransferRequest`, `TransferStep`, `TransferPlan`, `planTransfer`, `findClashes`, `freeName`, `validateName`; `TransferProgress`, `TransferResult`, `runTransfer(files, plan, opts)`; `importDropped(data: DataTransfer): Promise<{ files: FilesApi; paths: string[] }>`; `SearchHit`, `SearchProvider`.

- [ ] **Step 1: Package files.** `package.json` as in Task 1 Step 2 with name `@statewalker/file-panels.core`, directory `packages/file-panels.core`, description "What a file panel does: breadcrumb, safe copy and move across storages with byte progress, file operations with change events, and a panel model.", no `test:integration` script, and:

```json
  "dependencies": {
    "@statewalker/explorer.core": "catalog:",
    "@statewalker/file-mounts.core": "workspace:^",
    "@statewalker/shared-baseclass": "catalog:",
    "@statewalker/webrun-files": "catalog:",
    "@statewalker/webrun-files-mem": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "tsdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
```

`tsconfig.json`, `tsdown.config.ts` and `vitest.config.ts`: copies of Task 1's (vitest: `include: ["tests/**/*.test.ts"]`, no exclude). Run `pnpm install`.

- [ ] **Step 2: Copy the logic** listed under *Files* into `src/`, changing only imports (`problemOf`, `MountUnavailable`, `Problem` from `@statewalker/file-mounts.core`) and the `readDropped` → `importDropped` rename. `src/search.ts`:

```ts
/** A search result: phase 4 fills these from a full-text index over the mounts. */
export interface SearchHit {
  path: string;
  title: string;
  snippet?: string;
  score: number;
}

export interface SearchProvider {
  /** "fulltext", later "semantic"… */
  readonly id: string;
  search(query: string, opts: { scope?: string; signal?: AbortSignal }): AsyncIterable<SearchHit>;
}
```

`src/index.ts` exports `paths`, `transfer-plan`, `transfer-run`, `import-dropped`, `search` (`export type` for `search.ts`).

- [ ] **Step 3: Move the tests.** From `apps/ui-protos.app/test/file-panels-logic.test.ts`:
  - `breadcrumb and siblings` → `tests/paths.test.ts`;
  - `planTransfer`, `names`, `runTransfer`, `runTransfer fix round 1`, `final review fixes`, `nothing is lost when storages change during a transfer`, with the top-level helpers `wrap`, `isPart` and `names` → `tests/transfer.test.ts`.

  From `apps/ui-protos.app/test/file-commander.test.tsx`: `describe("readDropped")` → `tests/import-dropped.test.ts`, renamed `importDropped`.

  These tests use `newDemoStorages` from the prototype; packages can't import the app. Add `tests/storages.ts`, a test fixture that builds the same four mounts with the same files from `MemFilesApi`, `CompositeFilesApi`, `readOnly` and `unavailableFiles`. Copy `newDemoStorages` from `apps/ui-protos.app/src/file-panels/demo-storages.ts` with its `slowFiles` / `failingFiles` / `unavailableFiles` wrappers (the last now imported from `@statewalker/file-mounts.core`); keep its name and options so the moved tests run unchanged. Add `@statewalker/webrun-files-composite: catalog:` to devDependencies. `import-dropped.test.ts` needs `DataTransfer`-like plain objects only; set `// @vitest-environment node` and no DOM types beyond `File` (Node 24 has `File`).

- [ ] **Step 4: Run.** `pnpm --filter @statewalker/file-panels.core test` — Expected: the moved tests all pass (same counts as in the prototype groups). Typecheck, Biome clean.

- [ ] **Step 5: Commit.**

```bash
git add packages/file-panels.core pnpm-lock.yaml
git commit -m "feat(file-panels.core): the package, with breadcrumb, transfer planning and the safe transfer runner"
```

---

### Task 6: File operations with change events

**Files:**
- Create: `packages/file-panels.core/src/file-operations.ts`
- Modify: `src/index.ts`
- Test: `packages/file-panels.core/tests/file-operations.test.ts`

**Interfaces:**
- Consumes: `planTransfer`, `runTransfer`, `validateName`, `TransferRequest`, `TransferPlan`, `TransferResult`, `TransferProgress` (Task 5); `FileChangesHub`, `FileChange` from `@statewalker/file-mounts.core`.
- Produces: `class FileOperations` with `constructor(files: FilesApi, changes: FileChangesHub)`, `transfer(request: TransferRequest, opts?: { files?: FilesApi; signal?: AbortSignal; onProgress?(p: TransferProgress): void }): Promise<{ plan: TransferPlan; result: TransferResult }>` (throws `Error(plan.invalid)` for an invalid plan), `mkdir(dir: string, name: string): Promise<string>`, `rename(path: string, name: string): Promise<string>`, `remove(paths: string[]): Promise<void>`.

- [ ] **Step 1: Write the failing tests.**

```ts
import { type FileChange, newFileChanges } from "@statewalker/file-mounts.core";
import { readText, writeText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { FileOperations } from "../src/index.js";

const setup = async () => {
  const files = new MemFilesApi();
  await writeText(files, "/docs/a.md", "A");
  await writeText(files, "/docs/b.md", "B");
  await files.mkdir("/out");
  const changes = newFileChanges();
  const seen: FileChange[][] = [];
  changes.subscribe((c) => seen.push([...c]));
  return { files, ops: new FileOperations(files, changes), seen };
};

describe("FileOperations", () => {
  it("a move reports the new paths as added and the old ones as deleted, in one batch", async () => {
    const { files, ops, seen } = await setup();
    const { result } = await ops.transfer({ op: "move", sources: ["/docs/a.md"], targetDir: "/out", clash: "skip" });
    expect(result.done).toEqual(["/docs/a.md"]);
    expect(await readText(files, "/out/a.md")).toBe("A");
    expect(seen).toEqual([[{ type: "added", path: "/out/a.md" }, { type: "deleted", path: "/docs/a.md" }]]);
  });

  it("an overwrite is reported as updated; nothing is reported for skipped or failed items", async () => {
    const { ops, seen, files } = await setup();
    await writeText(files, "/out/a.md", "old");
    await ops.transfer({ op: "copy", sources: ["/docs/a.md"], targetDir: "/out", clash: "overwrite" });
    await ops.transfer({ op: "copy", sources: ["/docs/b.md", "/docs/a.md"], targetDir: "/out", clash: "skip" });
    expect(seen).toEqual([[{ type: "updated", path: "/out/a.md" }], [{ type: "added", path: "/out/b.md" }]]);
  });

  it("an invalid request throws its reason and writes nothing", async () => {
    const { ops, seen } = await setup();
    await expect(ops.transfer({ op: "copy", sources: ["/docs"], targetDir: "/docs/inner", clash: "skip" })).rejects.toThrow(
      "A folder can't be copied or moved into itself.",
    );
    expect(seen).toEqual([]);
  });

  it("mkdir and rename refuse a taken or invalid name; rename reports deleted + added", async () => {
    const { files, ops, seen } = await setup();
    await expect(ops.mkdir("/docs", "a.md")).rejects.toThrow("a.md already exists here.");
    await expect(ops.rename("/docs/a.md", "b.md")).rejects.toThrow("b.md already exists here.");
    await expect(ops.rename("/docs/a.md", "x/y")).rejects.toThrow("A name can't contain / or \\.");
    expect(await ops.mkdir("/docs", "new")).toBe("/docs/new");
    expect(await ops.rename("/docs/a.md", "c.md")).toBe("/docs/c.md");
    expect(await readText(files, "/docs/c.md")).toBe("A");
    expect(seen).toEqual([
      [{ type: "added", path: "/docs/new" }],
      [{ type: "deleted", path: "/docs/a.md" }, { type: "added", path: "/docs/c.md" }],
    ]);
  });

  it("remove deletes and reports each path", async () => {
    const { files, ops, seen } = await setup();
    await ops.remove(["/docs/a.md", "/docs/b.md"]);
    expect(await files.exists("/docs/a.md")).toBe(false);
    expect(seen).toEqual([[{ type: "deleted", path: "/docs/a.md" }, { type: "deleted", path: "/docs/b.md" }]]);
  });
});
```

- [ ] **Step 2: Run to see it fail.** Expected: FAIL, `FileOperations` not exported.

- [ ] **Step 3: Implement `src/file-operations.ts`.**

```ts
// The operations a panel offers, each reporting what it changed on the one
// change stream: panels refresh from it, an indexer will follow it.
import type { FileChange, FileChangesHub } from "@statewalker/file-mounts.core";
import type { FilesApi } from "@statewalker/webrun-files";
import { dirname, joinPath } from "@statewalker/webrun-files";
import { planTransfer, type TransferPlan, type TransferRequest, validateName } from "./transfer-plan.js";
import { runTransfer, type TransferProgress, type TransferResult } from "./transfer-run.js";

export class FileOperations {
  constructor(
    readonly files: FilesApi,
    readonly changes: FileChangesHub,
  ) {}

  /** Plans and runs a copy or move; `files` is another source (a desktop drop). */
  async transfer(
    request: TransferRequest,
    opts: { files?: FilesApi; signal?: AbortSignal; onProgress?(p: TransferProgress): void } = {},
  ): Promise<{ plan: TransferPlan; result: TransferResult }> {
    const files = opts.files ?? this.files;
    const plan = await planTransfer(files, request);
    if (plan.invalid) throw new Error(plan.invalid);
    const result = await runTransfer(files, plan, opts);
    const changes: FileChange[] = [];
    for (const step of plan.steps) {
      if (!result.done.includes(step.from)) continue;
      changes.push({ type: step.overwrite ? "updated" : "added", path: step.to });
      if (step.op === "move") changes.push({ type: "deleted", path: step.from });
    }
    this.changes.emit(changes);
    return { plan, result };
  }

  async mkdir(dir: string, name: string): Promise<string> {
    const path = await this.freePath(dir, name);
    await this.files.mkdir(path);
    this.changes.emit([{ type: "added", path }]);
    return path;
  }

  /** Never replaces: a name taken since the dialog opened is refused. */
  async rename(path: string, name: string): Promise<string> {
    const to = await this.freePath(dirname(path), name);
    if (!(await this.files.move(path, to))) throw new Error("It no longer exists.");
    this.changes.emit([
      { type: "deleted", path },
      { type: "added", path: to },
    ]);
    return to;
  }

  async remove(paths: string[]): Promise<void> {
    const removed: FileChange[] = [];
    try {
      for (const path of paths) {
        await this.files.remove(path);
        removed.push({ type: "deleted", path });
      }
    } finally {
      this.changes.emit(removed);
    }
  }

  private async freePath(dir: string, name: string): Promise<string> {
    const invalid = validateName(name);
    if (invalid) throw new Error(invalid);
    const path = joinPath(dir, name);
    if (await this.files.exists(path)) throw new Error(`${name} already exists here.`);
    return path;
  }
}
```

Export from `src/index.ts`.

- [ ] **Step 4: Run.** Expected: PASS; typecheck, Biome clean.

- [ ] **Step 5: Commit.**

```bash
git add packages/file-panels.core
git commit -m "feat(file-panels.core): file operations that report their changes"
```

---

### Task 7: The panel model, and the README

**Files:**
- Create: `packages/file-panels.core/src/panel-model.ts`, `packages/file-panels.core/README.md`
- Modify: `src/index.ts`
- Test: `packages/file-panels.core/tests/panel-model.test.ts`

**Interfaces:**
- Consumes: `FilesListModel` from `@statewalker/explorer.core` (`path`, `entries`, `loading`, `error`, `sortField`, `sortAscending`, `startLoading({ path })` returning `(result: { entries?; error? }) => void`, `setSort(field)`, `onUpdate`); `breadcrumb`, `siblings`, `Crumb` (Task 5); `FileChanges`, `Problem`, `problemOf` from `@statewalker/file-mounts.core`; `BaseClass`.
- Produces:
  - `interface PanelState { id: string; path: string; sort: { field: FilesListModel["sortField"]; descending: boolean } }`
  - `class PanelModel extends BaseClass` with `constructor(opts: { id: string; files: FilesApi; changes?: FileChanges; mountNames?: () => Record<string, string> })`, `readonly list: FilesListModel`, `problem?: Problem`, `notice?: string`, `get state(): PanelState`, `navigate(path): Promise<void>`, `up(): Promise<void>`, `refresh(): Promise<void>`, `setSort(field): void`, `breadcrumb(): Crumb[]`, `siblings(crumb): Promise<{ name: string; path: string }[]>`, `dispose(): void`

- [ ] **Step 1: Write the failing tests.**

```ts
import { MountUnavailable, newFileChanges, unavailableFiles } from "@statewalker/file-mounts.core";
import { type FilesApi, writeText } from "@statewalker/webrun-files";
import { CompositeFilesApi } from "@statewalker/webrun-files-composite";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { PanelModel } from "../src/index.js";

const names = (panel: PanelModel) => panel.list.entries.map((e) => e.name).sort();

const storages = async () => {
  const docs = new MemFilesApi();
  await writeText(docs, "/clients/dupont/offer.pdf", "pdf");
  await writeText(docs, "/notes/todo.md", "todo");
  const root = new CompositeFilesApi(new MemFilesApi())
    .mount("/docs", docs)
    .mount("/archive", unavailableFiles("archive", { cause: "locked", message: "Locked: unlock to use the S3 storages." }));
  return root as FilesApi;
};

describe("PanelModel", () => {
  it("navigates, goes up, and gives the breadcrumb with mount names", async () => {
    const panel = new PanelModel({ id: "p1", files: await storages(), mountNames: () => ({ docs: "Documents" }) });
    await panel.navigate("/docs/clients/");
    expect(panel.state.path).toBe("/docs/clients");
    expect(names(panel)).toEqual(["dupont"]);
    expect(panel.breadcrumb().map((c) => c.name)).toEqual(["Documents", "clients"]);
    expect((await panel.siblings({ name: "clients", path: "/docs/clients", isMount: false })).map((s) => s.name)).toEqual(["clients", "notes"]);
    await panel.up();
    expect(names(panel)).toEqual(["clients", "notes"]);
    await panel.navigate("/");
    expect(names(panel)).toEqual(["archive", "docs"]);
  });

  it("a locked storage is a problem with its reason, not an empty folder", async () => {
    const panel = new PanelModel({ id: "p1", files: await storages() });
    await panel.navigate("/archive");
    expect(panel.problem).toEqual({ cause: "locked", message: "Locked: unlock to use the S3 storages." });
    await panel.navigate("/docs");
    expect(panel.problem).toBeUndefined();
  });

  it("a folder that no longer exists sends the panel to its nearest ancestor, with a notice", async () => {
    const panel = new PanelModel({ id: "p1", files: await storages() });
    await panel.navigate("/docs/clients/gone/deeper");
    expect(panel.state.path).toBe("/docs/clients");
    expect(panel.notice).toBe("deeper no longer exists.");
  });

  it("a slow older navigation never replaces a newer one", async () => {
    const base = await storages();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    // A class instance: its methods live on the prototype, so delegate each one.
    const slow: FilesApi = {
      read: (p, o) => base.read(p, o),
      write: (p, c) => base.write(p, c),
      mkdir: (p) => base.mkdir(p),
      list: async function* (path, opts) {
        if (path === "/docs/clients") await gate;
        yield* base.list(path, opts);
      },
      stats: (p) => base.stats(p),
      exists: (p) => base.exists(p),
      remove: (p) => base.remove(p),
      move: (a, b) => base.move(a, b),
      copy: (a, b) => base.copy(a, b),
    };
    const panel = new PanelModel({ id: "p1", files: slow });
    const older = panel.navigate("/docs/clients");
    await panel.navigate("/docs/notes");
    release();
    await older;
    expect(panel.state.path).toBe("/docs/notes");
    expect(names(panel)).toEqual(["todo.md"]);
  });

  it("refreshes when a change touches its folder, and not otherwise", async () => {
    const files = await storages();
    const changes = newFileChanges();
    const panel = new PanelModel({ id: "p1", files, changes });
    await panel.navigate("/docs/notes");
    await writeText(files, "/docs/notes/new.md", "n");
    changes.emit([{ type: "added", path: "/docs/clients/x.md" }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(names(panel)).toEqual(["todo.md"]);
    changes.emit([{ type: "added", path: "/docs/notes/new.md" }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(names(panel)).toEqual(["new.md", "todo.md"]);
    panel.dispose();
  });

  it("state carries the sort for the dock layout", async () => {
    const panel = new PanelModel({ id: "p1", files: await storages() });
    panel.setSort("size");
    expect(panel.state.sort).toEqual({ field: "size", descending: false });
    panel.setSort("size");
    expect(panel.state.sort).toEqual({ field: "size", descending: true });
  });
});
```

If `CompositeFilesApi.mount` does not return the composite, build it in two statements. If `FilesListModel.setSort` toggles differently than its doc says, assert what it does and record it in the report.

- [ ] **Step 2: Run to see them fail.** Expected: FAIL, `PanelModel` not exported.

- [ ] **Step 3: Implement `src/panel-model.ts`.**

```ts
// One file panel: a folder of the mounted storages listed into explorer.core's
// FilesListModel (entries, sort, filter, cursor, selection), plus what a
// multi-panel manager needs: the breadcrumb, the reason a folder can't be read,
// and refreshes from the change stream.
import { FilesListModel } from "@statewalker/explorer.core";
import { type FileChanges, type Problem, problemOf } from "@statewalker/file-mounts.core";
import { BaseClass } from "@statewalker/shared-baseclass";
import type { FileInfo, FilesApi } from "@statewalker/webrun-files";
import { basename, dirname, normalizePath } from "@statewalker/webrun-files";
import { breadcrumb, type Crumb, siblings } from "./paths.js";

export interface PanelState {
  id: string;
  path: string;
  sort: { field: FilesListModel["sortField"]; descending: boolean };
}

/** A change at `changed` is visible in `folder`: inside it, the folder itself, or an ancestor. */
const touches = (changed: string, folder: string) =>
  dirname(changed) === folder || changed === folder || folder.startsWith(`${changed}/`);

export class PanelModel extends BaseClass {
  readonly id: string;
  readonly list = new FilesListModel();
  problem?: Problem;
  notice?: string;
  private loads = 0;
  private readonly files: FilesApi;
  private readonly mountNames: () => Record<string, string>;
  private readonly unsubscribe?: () => void;

  constructor(opts: {
    id: string;
    files: FilesApi;
    changes?: FileChanges;
    mountNames?: () => Record<string, string>;
  }) {
    super();
    this.id = opts.id;
    this.files = opts.files;
    this.mountNames = opts.mountNames ?? (() => ({}));
    this.unsubscribe = opts.changes?.subscribe((changes) => {
      if (changes.some((c) => touches(c.path, this.list.path))) void this.refresh();
    });
  }

  get state(): PanelState {
    return {
      id: this.id,
      path: this.list.path,
      sort: { field: this.list.sortField, descending: !this.list.sortAscending },
    };
  }

  /** Lists `path`; a newer navigation wins over a slower older one. */
  async navigate(path: string): Promise<void> {
    const load = ++this.loads;
    const wanted = normalizePath(path);
    let notice: string | undefined;
    let problem: Problem | undefined;
    let at = wanted;
    let entries: FileInfo[] | undefined;
    try {
      // A folder that is gone sends the panel to its nearest existing ancestor.
      while (at !== "/" && (await this.files.stats(at))?.kind !== "directory") at = dirname(at);
      if (at !== wanted) notice = `${basename(wanted)} no longer exists.`;
      const listed: FileInfo[] = [];
      for await (const entry of this.files.list(at)) listed.push(entry);
      entries = listed;
    } catch (error) {
      problem = problemOf(error);
    }
    if (load !== this.loads) return;
    const done = this.list.startLoading({ path: at });
    done(problem ? { error: problem.message } : { entries });
    this.problem = problem;
    this.notice = notice;
    this.notify();
  }

  up(): Promise<void> {
    return this.navigate(dirname(this.list.path));
  }

  refresh(): Promise<void> {
    return this.navigate(this.list.path);
  }

  setSort(field: FilesListModel["sortField"]) {
    this.list.setSort(field);
    this.notify();
  }

  breadcrumb(): Crumb[] {
    return breadcrumb(this.list.path, this.mountNames());
  }

  siblings(crumb: Crumb) {
    return siblings(this.files, crumb);
  }

  dispose() {
    this.unsubscribe?.();
  }
}
```

The listing is collected before `startLoading` is called, so an older navigation never touches the list after a newer one started (the `load` check). Export from `src/index.ts`.

- [ ] **Step 4: Run.** Expected: PASS; typecheck, Biome clean.

- [ ] **Step 5: README.** `packages/file-panels.core/README.md`, package shape, headings as claims. It must cover: what a panel model adds to `FilesListModel`; the transfer guarantees (the target replaced only by a complete copy, folders replaced not merged, nothing partial on cancel, a name taken meanwhile never replaced, a move deleting only what it copied unchanged, the hidden `.old-` path named when a rollback fails), each with the message the person sees; the cost of a folder overwrite on S3 (the final rename is a server-side copy and delete per object); the remaining window (checks happen just before a write, not atomically; closing it needs conditional writes from the storage); the change stream and who listens; `importDropped` and why entries are read before the first `await`; the search interfaces as phase 4's seam; dependencies; License MIT.

- [ ] **Step 6: Commit.**

```bash
git add packages/file-panels.core
git commit -m "feat(file-panels.core): panel model over FilesListModel; README"
```

---

### Task 8: The prototypes use the packages

**Files:**
- Modify: `apps/ui-protos.app/package.json` (dependencies `@statewalker/file-mounts.core: workspace:^`, `@statewalker/file-panels.core: workspace:^`)
- Modify: every prototype file importing the moved modules (the list: `connection-report.tsx`, `mount-form.tsx`, `s3-fields.tsx`, `storage-settings.tsx`, `storage-settings.stories.tsx`, `breadcrumb-bar.tsx`, `demo-storages.ts`, `file-commander.tsx`, `file-dialogs.tsx`, `file-panel.tsx`, `progress-strip.tsx`, `transfer-dialog.tsx`)
- Modify: `apps/ui-protos.app/src/file-panels/paths.ts` (keeps only `Sort`, `SortField`, `sortEntries`, `clickSelect`)
- Delete: `apps/ui-protos.app/src/file-panels/problem.ts`, `transfer-plan.ts`, `transfer-run.ts`, `dropped-files.ts`; `apps/ui-protos.app/src/file-mounts/mount-config.ts`, `s3-problems.ts`, `connection-test.ts`
- Modify: `apps/ui-protos.app/test/file-panels-logic.test.ts` (keep only `demo storages` and `sorting and selection`), `test/file-mounts-logic.test.ts` (delete: every block moved in Task 1), `test/file-commander.test.tsx` (drop the moved `readDropped` block)

**Interfaces:**
- Consumes: everything Tasks 1, 5 and 6 export.

- [ ] **Step 1: Switch imports.** Replace each import of a deleted module with the package export of the same name (`readDropped` → `importDropped`). `demo-storages.ts` imports `unavailableFiles`, `MountUnavailable` and `Problem` from `@statewalker/file-mounts.core` and drops its own `unavailableFiles`.

- [ ] **Step 2: The commander's rename, mkdir and delete go through `FileOperations`.** In `file-commander.tsx`, create the operations once per `files`:

```tsx
const ops = useMemo(() => new FileOperations(files, newFileChanges()), [files]);
```

and replace the three dialog handlers:

```tsx
onConfirm={(name) => attempt(() => ops.mkdir(dialog.dir, name))}
...
onConfirm={(name) => attempt(() => ops.rename(dialog.path, name))}
...
const remove = (paths: string[]) =>
  attempt(async () => {
    setPanels((ps) => ps.map((p) => ({ ...p, selected: [] })));
    await ops.remove(paths);
  });
```

`transfer` keeps its flow but calls `ops.transfer(request, { files: source, signal: abort.signal, onProgress })` and takes `{ plan, result }` from it (an invalid plan now throws, which the existing `catch` already turns into the summary).

- [ ] **Step 3: Delete the moved files and test blocks** listed under *Files*.

- [ ] **Step 4: Run.** From the repo root:

```bash
pnpm --filter @statewalker/ui-protos-app test
pnpm --filter @statewalker/ui-protos-app exec tsc --noEmit
pnpm biome check --write --unsafe apps/ui-protos.app packages/file-mounts.core packages/file-panels.core
pnpm test && pnpm typecheck
```

Expected: everything passes. The ui-protos test count drops by exactly the number of tests moved into the packages; the packages' counts include them. Then build Storybook once (`pnpm --filter @statewalker/ui-protos-app build`) to prove the stories resolve the packages through the `source` condition.

- [ ] **Step 5: Commit.**

```bash
git add -A apps/ui-protos.app pnpm-lock.yaml
git commit -m "refactor(ui-protos.app): Files app prototypes use file-mounts.core and file-panels.core"
```
