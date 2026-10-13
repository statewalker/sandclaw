import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  IdbStore,
  type KeyValueStore,
  MemoryStore,
  type MountConfig,
  Profiles,
  SecretsLocked,
  validateProfileName,
} from "../src/index.js";

const newProfiles = (records: KeyValueStore<unknown> = new MemoryStore<unknown>()) =>
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
