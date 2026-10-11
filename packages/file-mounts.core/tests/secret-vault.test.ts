import { readText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { MemoryStore, SecretsLocked, SecretVault } from "../src/index.js";

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
