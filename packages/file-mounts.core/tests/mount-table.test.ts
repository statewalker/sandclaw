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
      throw new MountUnavailable(m.key, {
        cause: "no-bucket",
        message: "Bucket `b` not found at this endpoint.",
      });
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
