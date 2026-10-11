import { describe, expect, it } from "vitest";
import { s3Settings, testConnection } from "../src/index.js";

describe("s3Settings", () => {
  it("reads a mount's config; path-style unless switched off", () => {
    expect(
      s3Settings({
        endpoint: "https://s3.example.com",
        region: "eu-west-3",
        bucket: "b",
        prefix: "a/b/",
      }),
    ).toEqual({
      endpoint: "https://s3.example.com",
      region: "eu-west-3",
      bucket: "b",
      prefix: "a/b/",
      pathStyle: true,
    });
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
    expect(report.problem).toMatchObject({
      cause: "unreachable",
      message: "No answer from http://127.0.0.1:1.",
    });
  });
});
