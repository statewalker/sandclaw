// The whole path from a locked vault to a panel listing an S3-like storage,
// through public exports only: vault, mount table, change hub, panel.
import {
  FilesMountTable,
  MemoryStore,
  type MountConfig,
  type MountType,
  MountUnavailable,
  newFileChanges,
  SecretVault,
} from "@statewalker/file-mounts.core";
import { writeText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { PanelModel } from "../src/index.js";

describe("unlock to listing", () => {
  it("a locked storage shows its problem; after unlock and apply the panel lists it", async () => {
    const appFiles = new MemFilesApi();
    const vault = new SecretVault({
      files: appFiles,
      dir: "/.files",
      keys: new MemoryStore<CryptoKey>(),
      iterations: 1000,
    });
    await vault.load();
    await vault.create("pw", false);
    await vault.set("archive/accessKeyId", "AKIA");
    vault.lock();

    // Stands in for S3: it needs a key from the vault, and serves a bucket only with the right one.
    const bucket = new MemFilesApi();
    await writeText(bucket, "/report.pdf", "pdf");
    const secretNeeding: MountType = {
      id: "s3",
      label: "Scripted S3",
      fields: [],
      isAvailable: () => ({ ok: true }),
      async create(mount, ctx) {
        if ((await ctx.secret("accessKeyId")) !== "AKIA") {
          throw new MountUnavailable(mount.key, { cause: "bad-keys", message: "Wrong keys." });
        }
        return bucket;
      },
    };
    const table = new FilesMountTable({ types: [secretNeeding], secrets: vault });
    const changes = newFileChanges();
    const configs: MountConfig[] = [{ key: "archive", name: "Archive", type: "s3", config: {} }];
    changes.emit(await table.apply(configs));

    const panel = new PanelModel({ id: "p1", files: table.files, changes });
    await panel.navigate("/archive");
    expect(panel.problem).toEqual({
      cause: "locked",
      message: "Locked: unlock to use the S3 storages.",
    });

    expect(await vault.unlock("pw", false)).toBe(true);
    const applied = await table.apply(configs);
    expect(applied).toEqual([{ type: "updated", path: "/archive" }]);
    const refreshed = new Promise<void>((resolve) => {
      const off = panel.onUpdate(() => {
        off();
        resolve();
      });
    });
    changes.emit(applied);
    await refreshed;
    expect(panel.problem).toBeUndefined();
    expect(panel.list.entries.map((e) => e.name)).toEqual(["report.pdf"]);
  });
});
