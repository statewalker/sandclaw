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
  const mount = (
    config: Partial<Record<string, string>> = {},
    extra: Partial<MountConfig> = {},
  ): MountConfig => ({
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
    const report = await testConnection(
      mount(),
      { accessKeyId: "nobody", secretAccessKey: "nothing" },
      { origin },
    );
    expect(report.checks.find((c) => c.state === "failed")?.id).toBe("keys");
    expect(report.problem).toMatchObject({
      cause: "bad-keys",
      message: "Wrong access key or secret.",
    });
  });

  it("a missing bucket fails the bucket check", async () => {
    const report = await testConnection(mount({ bucket: "no-such-bucket" }), s3.keys, { origin });
    expect(report.checks.find((c) => c.state === "failed")?.id).toBe("bucket");
    expect(report.problem).toMatchObject({
      cause: "no-bucket",
      message: "Bucket `no-such-bucket` not found at this endpoint.",
    });
  });

  it("a mount writes under its prefix, and a transfer between storages works", async () => {
    const secrets = new Map([
      ["archive/accessKeyId", s3.keys.accessKeyId],
      ["archive/secretAccessKey", s3.keys.secretAccessKey],
    ]);
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
    expect(table.list()[0]?.status).toMatchObject({
      state: "failed",
      problem: { cause: "bad-keys" },
    });
  });
});
