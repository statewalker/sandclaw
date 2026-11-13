import type { FilesApi } from "@statewalker/webrun-files";
import { tryReadJson, writeJsonAtomic } from "../util/io.js";

/** The on-disk lease record. */
export interface ScanLockData {
  /** Identifies the holding process/tab; stable for one JS context. */
  holderId: string;
  acquiredAt: number;
  /** Last heartbeat; the lease is stale once `now - renewedAt >= ttlMs`. */
  renewedAt: number;
  ttlMs: number;
}

export interface ScanLockOptions {
  holderId: string;
  /** Lease lifetime; a holder must renew within this window or be taken over. */
  ttlMs?: number;
  /** Injectable clock (tests). */
  now?: () => number;
  /** Delay before the acquire re-read that confirms a contended claim (tests use 0). */
  confirmDelayMs?: number;
}

export const DEFAULT_TTL_MS = 60_000;
export const DEFAULT_RENEW_MS = 20_000;

/**
 * Best-effort, advisory per-project scan lock backed by a single lock file. The browser
 * File System Access API offers no atomic create / compare-and-swap, so this is NOT
 * strict mutual exclusion: a TOCTOU window on acquire and a holder stalled past its TTL
 * can both let two writers run. It is paired with concurrency-safe atomic writes +
 * content-hash-gated builders, so a rare double-run is wasteful, not corrupting. In the
 * common case (multiple tabs + the CLI on one folder) it lets exactly one index while
 * the others skip and consume the result.
 */
export class ScanLock {
  private readonly holderId: string;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly confirmDelayMs: number;

  constructor(
    private readonly files: FilesApi,
    private readonly path: string,
    opts: ScanLockOptions,
  ) {
    this.holderId = opts.holderId;
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.now = opts.now ?? (() => Date.now());
    this.confirmDelayMs = opts.confirmDelayMs ?? 25;
  }

  private isStale(lock: ScanLockData, t: number): boolean {
    return t - lock.renewedAt >= lock.ttlMs;
  }

  /**
   * Try to claim the lease. Returns true if we now hold it. Skips when a different,
   * non-stale holder is live; otherwise writes our claim and re-reads to confirm we
   * won a contended write (best-effort — the FS has no atomic create).
   */
  async tryAcquire(): Promise<boolean> {
    const existing = await tryReadJson<ScanLockData>(this.files, this.path);
    if (existing && existing.holderId !== this.holderId && !this.isStale(existing, this.now())) {
      return false;
    }
    await this.write(this.now(), existing?.acquiredAt);
    if (this.confirmDelayMs > 0) await delay(this.confirmDelayMs);
    const after = await tryReadJson<ScanLockData>(this.files, this.path);
    return after?.holderId === this.holderId;
  }

  /** Refresh the lease. Returns false if a different holder has taken it over. */
  async renew(): Promise<boolean> {
    const current = await tryReadJson<ScanLockData>(this.files, this.path);
    if (current && current.holderId !== this.holderId) return false;
    await this.write(this.now(), current?.acquiredAt);
    return true;
  }

  /** Release the lease if we still own it (or it is gone). */
  async release(): Promise<void> {
    const current = await tryReadJson<ScanLockData>(this.files, this.path);
    if (!current || current.holderId === this.holderId) {
      await this.files.remove(this.path).catch(() => {});
    }
  }

  private write(t: number, acquiredAt?: number): Promise<void> {
    return writeJsonAtomic(this.files, this.path, {
      holderId: this.holderId,
      acquiredAt: acquiredAt ?? t,
      renewedAt: t,
      ttlMs: this.ttlMs,
    } satisfies ScanLockData);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One lease file held on behalf of every overlapping operation of this JS context. */
interface SharedLease {
  users: number;
  /** Whether the lease was acquired (shared by every user). */
  acquired: Promise<boolean>;
  /** Per party (e.g. a builder): its preparation under this acquisition. */
  readonly prepared: Map<unknown, Promise<void>>;
  release(): Promise<void>;
}

const sharedLeases = new WeakMap<FilesApi, Map<string, SharedLease>>();
/** Releases in flight, per lease file: a new acquisition waits for them. */
const releasing = new WeakMap<FilesApi, Map<string, Promise<void>>>();

/**
 * Run `fn` holding the scan lease at `path`, or resolve `undefined` when another writer
 * holds it. Overlapping operations of this JS context (they share one holder id) share a
 * single acquisition, heartbeat and release — the lease is released when the last of them
 * finishes, never while another still works. `prepare()` runs inside the lease
 * before `fn`, once per `party` per acquisition (e.g. reloading a store another writer
 * may have changed).
 */
export async function withSharedScanLease<T>(
  files: FilesApi,
  path: string,
  opts: ScanLockOptions & { renewMs?: number },
  party: unknown,
  prepare: () => Promise<void>,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const byPath = sharedLeases.get(files) ?? new Map<string, SharedLease>();
  sharedLeases.set(files, byPath);
  let lease = byPath.get(path);
  if (!lease) {
    const lock = new ScanLock(files, path, opts);
    let renew: ReturnType<typeof setInterval> | undefined;
    const previous = releasing.get(files)?.get(path) ?? Promise.resolve();
    const acquired = previous.then(async () => {
      const ok = await lock.tryAcquire();
      if (ok) renew = setInterval(() => void lock.renew(), opts.renewMs ?? DEFAULT_RENEW_MS);
      return ok;
    });
    lease = {
      users: 0,
      acquired,
      prepared: new Map(),
      release: async () => {
        clearInterval(renew);
        await lock.release();
      },
    };
    byPath.set(path, lease);
  }
  const current = lease;
  current.users++;
  const leave = async (ok: boolean) => {
    current.users--;
    if (current.users > 0) return;
    if (byPath.get(path) === current) byPath.delete(path);
    if (!ok) return;
    const inFlight = releasing.get(files) ?? new Map<string, Promise<void>>();
    releasing.set(files, inFlight);
    const done = current.release();
    inFlight.set(path, done);
    try {
      await done;
    } finally {
      if (inFlight.get(path) === done) inFlight.delete(path);
    }
  };
  let ok = false;
  try {
    ok = await current.acquired;
    if (!ok) return undefined;
    let prepared = current.prepared.get(party);
    if (!prepared) {
      prepared = prepare();
      current.prepared.set(party, prepared);
    }
    await prepared;
    return await fn();
  } finally {
    await leave(ok);
  }
}

/** Whether an operation of this JS context currently holds (or is acquiring) the lease at `path`. */
export function isScanLeaseShared(files: FilesApi, path: string): boolean {
  return (sharedLeases.get(files)?.get(path)?.users ?? 0) > 0;
}
