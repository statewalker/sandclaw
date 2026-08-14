import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { ScanLock, type ScanLockData } from "../../src/runtime/scan-lock.js";
import { tryReadJson } from "../../src/util/io.js";

const LOCK = "proj/.project/state/scan.lock";

/** A controllable clock for deterministic lease-expiry tests. */
function clock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function lock(files: MemFilesApi, holderId: string, now: () => number, ttlMs = 60_000): ScanLock {
  return new ScanLock(files, LOCK, { holderId, ttlMs, now, confirmDelayMs: 0 });
}

describe("ScanLock", () => {
  it("acquires a free lock and records the holder", async () => {
    const files = new MemFilesApi();
    const c = clock();
    expect(await lock(files, "A", c.now).tryAcquire()).toBe(true);
    const data = await tryReadJson<ScanLockData>(files, LOCK);
    expect(data?.holderId).toBe("A");
  });

  it("refuses a second holder while the lease is live", async () => {
    const files = new MemFilesApi();
    const c = clock();
    expect(await lock(files, "A", c.now).tryAcquire()).toBe(true);
    c.advance(10_000); // well within the 60s ttl
    expect(await lock(files, "B", c.now).tryAcquire()).toBe(false);
  });

  it("lets another holder take over a stale lease", async () => {
    const files = new MemFilesApi();
    const c = clock();
    expect(await lock(files, "A", c.now).tryAcquire()).toBe(true);
    c.advance(60_000); // ttl elapsed → stale
    expect(await lock(files, "B", c.now).tryAcquire()).toBe(true);
    expect((await tryReadJson<ScanLockData>(files, LOCK))?.holderId).toBe("B");
  });

  it("renews while owned and reports loss after a takeover", async () => {
    const files = new MemFilesApi();
    const c = clock();
    const a = lock(files, "A", c.now);
    expect(await a.tryAcquire()).toBe(true);
    c.advance(20_000);
    expect(await a.renew()).toBe(true); // still ours
    c.advance(60_000);
    expect(await lock(files, "B", c.now).tryAcquire()).toBe(true); // B takes over
    expect(await a.renew()).toBe(false); // A has lost it
  });

  it("releases only its own lease", async () => {
    const files = new MemFilesApi();
    const c = clock();
    const a = lock(files, "A", c.now);
    await a.tryAcquire();
    // B must not delete A's live lease.
    await lock(files, "B", c.now).release();
    expect(await tryReadJson<ScanLockData>(files, LOCK)).toBeDefined();
    await a.release();
    expect(await tryReadJson<ScanLockData>(files, LOCK)).toBeUndefined();
  });
});
