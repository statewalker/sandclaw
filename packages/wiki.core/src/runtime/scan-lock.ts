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
