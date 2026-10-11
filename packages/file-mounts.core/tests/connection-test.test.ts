import { describe, expect, it, vi } from "vitest";
import { classifyS3Error, corsRule, fakeProbe, runConnectionTest } from "../src/index.js";

const connForm = { endpoint: "https://s3.example.com", bucket: "archive", readOnly: false };
const origin = "https://files.sandclaw.app";

describe("connection test", () => {
  it("passes every check", async () => {
    const report = await runConnectionTest(fakeProbe("ok"), connForm, { origin });
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => c.state)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
  });
  it("stops at the first failure and names it", async () => {
    const report = await runConnectionTest(fakeProbe("no-bucket"), connForm, { origin });
    expect(report.checks.map((c) => c.state)).toEqual(["ok", "ok", "failed", "not-run", "not-run"]);
    expect(report.problem?.message).toBe("Bucket `archive` not found at this endpoint.");
  });
  it("skips the write check for a read-only mount", async () => {
    const report = await runConnectionTest(
      fakeProbe("denied-write"),
      { ...connForm, readOnly: true },
      { origin },
    );
    expect(report.ok).toBe(true);
    expect(report.checks.at(-1)?.state).toBe("skipped");
  });
  it("tells CORS from an unreachable host", async () => {
    const cors = await runConnectionTest(fakeProbe("cors"), connForm, { origin });
    expect(cors.problem?.cause).toBe("cors");
    expect(cors.problem?.fix?.json).toBe(corsRule(origin));
    const down = await runConnectionTest(fakeProbe("unreachable"), connForm, { origin });
    expect(down.problem?.message).toBe("No answer from https://s3.example.com.");
  });
  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const running = runConnectionTest(fakeProbe("timeout"), connForm, {
        origin,
        timeoutMs: 15000,
      });
      await vi.advanceTimersByTimeAsync(15000);
      const report = await running;
      expect(report.problem?.message).toBe("No answer in 15 seconds.");
      expect(report.checks.map((c) => c.state)).toEqual([
        "failed",
        "not-run",
        "not-run",
        "not-run",
        "not-run",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("stops without a problem when cancelled", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const running = runConnectionTest(fakeProbe("ok", 100), connForm, {
        origin,
        signal: controller.signal,
      });
      await vi.advanceTimersByTimeAsync(150);
      controller.abort();
      const report = await running;
      expect(report.ok).toBe(false);
      expect(report.problem).toBeUndefined();
      expect(report.checks.map((c) => c.state)).toEqual([
        "ok",
        "not-run",
        "not-run",
        "not-run",
        "not-run",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("classifyS3Error", () => {
  const ctx = {
    check: "write" as const,
    endpoint: "https://s3.example.com",
    bucket: "archive",
    origin,
  };
  it("maps SDK errors to plain causes and keeps the raw detail", () => {
    expect(classifyS3Error({ name: "SignatureDoesNotMatch", message: "x" }, ctx)).toMatchObject({
      cause: "bad-keys",
      message: "Wrong access key or secret.",
      detail: "SignatureDoesNotMatch: x",
    });
    expect(
      classifyS3Error({ name: "Forbidden", $metadata: { httpStatusCode: 403 } }, ctx).message,
    ).toBe("These keys can't write to this bucket.");
    expect(classifyS3Error({ name: "Weird", message: "boom" }, ctx)).toMatchObject({
      cause: "unknown",
      detail: "Weird: boom",
    });
  });
});
