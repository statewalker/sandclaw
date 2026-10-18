import { defineSlot, type SlotDeclaration } from "@statewalker/shared-slots";
import type { AppContext } from "./context.js";
import { getSlots } from "./systems.js";

/**
 * Services are slot contributions. A service declaration is a plain slot of
 * providers; any fragment may provide an implementation, and consumers get
 * the one with the highest priority (the latest among equals). Withdrawing a
 * provider (its disposer) falls back to the next one, and observers see each
 * change, so a fragment can be unloaded and replaced at runtime.
 */
export interface ServiceProvider<T> {
  readonly value: T;
  readonly priority: number;
  readonly seq: number;
}

export interface ServiceDeclaration<T> {
  readonly key: string;
  readonly slot: SlotDeclaration<ServiceProvider<T>>;
}

export function defineService<T>(key: string): ServiceDeclaration<T> {
  return Object.freeze({ key, slot: defineSlot<ServiceProvider<T>>(`service:${key}`) });
}

export interface ProvideServiceOptions {
  /** Higher wins. Default `0`; use a negative value for fallbacks. */
  priority?: number;
}

let seq = 0;

/** Provide an implementation of `decl`. Returns the disposer that withdraws it. */
export function provideService<T>(
  ctx: AppContext,
  decl: ServiceDeclaration<T>,
  value: T,
  options: ProvideServiceOptions = {},
): () => void {
  const provider: ServiceProvider<T> = { value, priority: options.priority ?? 0, seq: seq++ };
  return getSlots(ctx).provide(decl.slot, provider);
}

function pick<T>(providers: readonly ServiceProvider<T>[]): T | undefined {
  let best: ServiceProvider<T> | undefined;
  for (const p of providers) {
    if (!best || p.priority > best.priority || (p.priority === best.priority && p.seq > best.seq)) {
      best = p;
    }
  }
  return best?.value;
}

/** The current implementation of `decl`, or `undefined` when none is provided. */
export function getService<T>(ctx: AppContext, decl: ServiceDeclaration<T>): T | undefined {
  return pick(getSlots(ctx).getSnapshot(decl.slot));
}

/** The current implementation of `decl`; throws when none is provided. */
export function requireService<T>(ctx: AppContext, decl: ServiceDeclaration<T>): T {
  const value = getService(ctx, decl);
  if (value === undefined) throw new Error(`No provider for service "${decl.key}"`);
  return value;
}

/**
 * Call `cb` with the current implementation now and whenever it changes
 * (including to `undefined` when the last provider leaves). Returns the disposer.
 */
export function observeService<T>(
  ctx: AppContext,
  decl: ServiceDeclaration<T>,
  cb: (value: T | undefined) => void,
): () => void {
  let first = true;
  let last: T | undefined;
  return getSlots(ctx).observe(decl.slot, (providers) => {
    const value = pick(providers);
    if (!first && value === last) return;
    first = false;
    last = value;
    cb(value);
  });
}

/** Resolve with the implementation of `decl` as soon as one is provided. */
export function waitForService<T>(
  ctx: AppContext,
  decl: ServiceDeclaration<T>,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const { signal } = options;
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    let done = false;
    let stop: (() => void) | undefined;
    const onAbort = () => {
      if (done) return;
      done = true;
      stop?.();
      reject(signal?.reason);
    };
    stop = observeService(ctx, decl, (value) => {
      if (done || value === undefined) return;
      done = true;
      signal?.removeEventListener("abort", onAbort);
      // On the synchronous first call `stop` is not assigned yet; it is
      // disposed right after `observe` returns instead.
      stop?.();
      resolve(value);
    });
    if (done) stop();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}
