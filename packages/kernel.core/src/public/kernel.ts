import { defineKeyedSlot } from "@statewalker/shared-slots";
import { orderNodes } from "../internal/order.js";
import { AppConfig, configAdapter } from "./config.js";
import { type AppContext, createAppContext, defineContextAdapter } from "./context.js";
import {
  type ActivateResult,
  type Cleanup,
  type FragmentInit,
  type FragmentSource,
  isLazyFragment,
  resolveActivate,
} from "./fragment.js";
import { getLogger, getSlots } from "./systems.js";

export type FragmentStatus =
  /** Known to the kernel, not activated yet. */
  | "pending"
  /** Its code is being loaded or its `activate` is running. */
  | "activating"
  | "active"
  /** Loading or `activate` threw. */
  | "failed"
  /** A required fragment is missing or not active. */
  | "blocked"
  /** Deactivated by `stop` or `unload`. */
  | "stopped";

/** What the kernel knows about one fragment; published to `fragmentsSlot`. */
export interface FragmentState {
  readonly id: string;
  readonly label?: string;
  readonly requires: readonly string[];
  readonly after: readonly string[];
  readonly status: FragmentStatus;
  readonly error?: unknown;
}

/** The kernel's fragments and their status, keyed by fragment id. */
export const fragmentsSlot = defineKeyedSlot<FragmentState>("kernel:fragments");

export type KernelPhase = "load" | "activate" | "deactivate";

export interface KernelOptions {
  /** The app context; a fresh one by default. */
  context?: AppContext;
  /** Raw configuration by section key (see `defineConfig`). */
  config?: Record<string, unknown>;
  /** Fragments to activate on `start`. */
  fragments?: readonly FragmentSource[];
  /** Called for every fragment failure; the kernel logs to `loggerAdapter` by default. */
  onError?: (fragmentId: string, error: unknown, phase: KernelPhase) => void;
}

interface Entry {
  source: FragmentSource;
  state: FragmentState;
  cleanup?: Cleanup;
  unpublish?: () => void;
}

/** The kernel that runs an app, reachable from its context. */
export const kernelAdapter = defineContextAdapter<Kernel>("kernel:kernel");

function isThenable<T>(value: unknown): value is PromiseLike<T> {
  return !!value && typeof (value as PromiseLike<T>).then === "function";
}

/** Run `next` after `value` when it is a promise, right away otherwise. */
function then(value: Promise<void> | void, next: () => void): Promise<void> | void {
  return isThenable<void>(value) ? Promise.resolve(value).then(next) : next();
}

/**
 * The kernel loader. It owns the app context, orders the app's fragments by
 * their `requires` / `after` declarations (keeping the given order wherever
 * it can), activates them one by one and tears them down in reverse.
 *
 * - A fragment that throws is marked `failed`; fragments that require it are
 *   `blocked`; every other fragment still starts.
 * - Fragments can be loaded and unloaded at runtime. Unloading a fragment
 *   first deactivates the fragments that require it; loading one retries the
 *   fragments it unblocks.
 * - Synchronous fragments are activated (and torn down) synchronously: when
 *   every fragment a `start` or `stop` touches is synchronous, the work is
 *   done when the call returns, and the promise only reports completion.
 * - Operations are serialized: a `load` issued while `start` runs waits for it.
 */
export class Kernel {
  readonly context: AppContext;
  private readonly entries = new Map<string, Entry>();
  /** Ids of the active fragments, in activation order. */
  private readonly active: string[] = [];
  private readonly onError: (fragmentId: string, error: unknown, phase: KernelPhase) => void;
  private tail: Promise<void> = Promise.resolve();
  private running = 0;

  constructor(options: KernelOptions = {}) {
    this.context = options.context ?? createAppContext();
    kernelAdapter.set(this.context, this);
    if (options.config) configAdapter.set(this.context, new AppConfig(options.config));
    this.onError =
      options.onError ??
      ((id, error, phase) => getLogger(this.context).error(`[kernel] ${phase} "${id}":`, error));
    this.add(...(options.fragments ?? []));
  }

  /** Register fragments without activating them (`start` or `load` will). */
  add(...sources: FragmentSource[]): this {
    for (const source of sources) {
      if (this.entries.has(source.id)) throw new Error(`Duplicate fragment id "${source.id}"`);
      const entry: Entry = {
        source,
        state: {
          id: source.id,
          label: source.label,
          requires: [...(source.requires ?? [])],
          after: [...(source.after ?? [])],
          status: "pending",
        },
      };
      this.entries.set(source.id, entry);
      this.publish(entry);
    }
    return this;
  }

  /** Activate every fragment that is not active yet, in dependency order. */
  start(): Promise<void> {
    return this.run(() => this.activateAll());
  }

  /** Add fragments and activate them (plus any fragment they unblock). */
  load(...sources: FragmentSource[]): Promise<void> {
    return this.run(() => {
      this.add(...sources);
      return this.activateAll();
    });
  }

  /** Deactivate a fragment, and first every fragment that requires it, then forget it. */
  unload(id: string): Promise<void> {
    return this.run(() => {
      const entry = this.entries.get(id);
      if (!entry) return;
      const doomed = this.dependentsOf(id);
      const ids = [...this.active].reverse().filter((activeId) => doomed.has(activeId));
      return then(
        this.deactivateAll(ids, (activeId) => (activeId === id ? "stopped" : "blocked")),
        () => {
          entry.unpublish?.();
          this.entries.delete(id);
        },
      );
    });
  }

  /** Deactivate every fragment, in reverse activation order. */
  stop(): Promise<void> {
    return this.run(() => this.deactivateAll([...this.active].reverse(), () => "stopped"));
  }

  get(id: string): FragmentState | undefined {
    return this.entries.get(id)?.state;
  }

  list(): FragmentState[] {
    return [...this.entries.values()].map((e) => e.state);
  }

  // ── internals ────────────────────────────────────────────────

  /**
   * Run `op` now when idle, else after the operations already queued. An `op`
   * that completes synchronously leaves the kernel idle again before `run`
   * returns, so back-to-back synchronous calls stay synchronous.
   */
  private run(op: () => Promise<void> | void): Promise<void> {
    const settle = (result: Promise<void> | void): Promise<void> => {
      const done = Promise.resolve(result).finally(() => {
        this.running--;
      });
      this.tail = done.catch(() => {});
      return done;
    };
    this.running++;
    if (this.running > 1) return settle(this.tail.then(op));
    let result: Promise<void> | void;
    try {
      result = op();
    } catch (error) {
      this.running--;
      return Promise.reject(error);
    }
    if (isThenable<void>(result)) return settle(result);
    this.running--;
    return Promise.resolve();
  }

  /** Activate pending fragments in order; awaits only fragments that are asynchronous. */
  private activateAll(): Promise<void> | void {
    const ordered = orderNodes([...this.entries.values()].map((e) => e.state));
    const step = (from: number): Promise<void> | void => {
      for (let i = from; i < ordered.length; i++) {
        const entry = this.entries.get((ordered[i] as FragmentState).id);
        if (!entry || entry.state.status === "active" || entry.state.status === "failed") continue;
        const missing = entry.state.requires.find(
          (req) => this.entries.get(req)?.state.status !== "active",
        );
        if (missing !== undefined) {
          const reason = this.entries.has(missing) ? "is not active" : "is not part of the app";
          this.setState(entry, {
            status: "blocked",
            error: new Error(`Requires "${missing}", which ${reason}`),
          });
          continue;
        }
        const pending = this.activate(entry);
        if (pending) return pending.then(() => step(i + 1));
      }
    };
    return step(0);
  }

  private activate(entry: Entry): Promise<void> | void {
    const { source } = entry;
    this.setState(entry, { status: "activating", error: undefined });
    if (!isLazyFragment(source)) return this.runInit(entry, source.activate);
    let loading: Promise<unknown>;
    try {
      loading = Promise.resolve(source.load());
    } catch (error) {
      return this.fail(entry, error, "load");
    }
    return loading.then(
      (loaded) => {
        let init: FragmentInit;
        try {
          init = resolveActivate(source.id, loaded as Parameters<typeof resolveActivate>[1]);
        } catch (error) {
          return this.fail(entry, error, "load");
        }
        return this.runInit(entry, init);
      },
      (error) => this.fail(entry, error, "load"),
    );
  }

  private runInit(entry: Entry, init: FragmentInit): Promise<void> | void {
    let result: ReturnType<FragmentInit>;
    try {
      result = init(this.context);
    } catch (error) {
      return this.fail(entry, error, "activate");
    }
    if (!isThenable<ActivateResult>(result)) return this.activated(entry, result);
    return Promise.resolve(result).then(
      (cleanup) => this.activated(entry, cleanup),
      (error) => this.fail(entry, error, "activate"),
    );
  }

  private activated(entry: Entry, cleanup: ActivateResult): void {
    entry.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    this.active.push(entry.state.id);
    this.setState(entry, { status: "active" });
  }

  private fail(entry: Entry, error: unknown, phase: KernelPhase): void {
    this.setState(entry, { status: "failed", error });
    this.onError(entry.state.id, error, phase);
  }

  /** Deactivate `ids` in the given order; awaits only cleanups that return a promise. */
  private deactivateAll(
    ids: readonly string[],
    statusOf: (id: string) => "stopped" | "blocked",
  ): Promise<void> | void {
    const step = (from: number): Promise<void> | void => {
      for (let i = from; i < ids.length; i++) {
        const id = ids[i] as string;
        const pending = this.deactivate(id, statusOf(id));
        if (pending) return pending.then(() => step(i + 1));
      }
    };
    return step(0);
  }

  private deactivate(id: string, status: "stopped" | "blocked"): Promise<void> | void {
    const entry = this.entries.get(id);
    const i = this.active.lastIndexOf(id);
    if (i >= 0) this.active.splice(i, 1);
    if (!entry) return;
    const cleanup = entry.cleanup;
    entry.cleanup = undefined;
    const done = () => this.setState(entry, { status });
    const failed = (error: unknown) => {
      this.onError(id, error, "deactivate");
      done();
    };
    let result: void | Promise<void>;
    try {
      result = cleanup?.();
    } catch (error) {
      return failed(error);
    }
    if (!isThenable<void>(result)) return done();
    return Promise.resolve(result).then(done, failed);
  }

  /** `id` and every active fragment that requires it, transitively. */
  private dependentsOf(id: string): Set<string> {
    const result = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const activeId of this.active) {
        if (result.has(activeId)) continue;
        const requires = this.entries.get(activeId)?.state.requires ?? [];
        if (requires.some((r) => result.has(r))) {
          result.add(activeId);
          grew = true;
        }
      }
    }
    return result;
  }

  private setState(entry: Entry, patch: Partial<FragmentState>): void {
    entry.state = Object.freeze({ ...entry.state, ...patch });
    this.publish(entry);
  }

  private publish(entry: Entry): void {
    entry.unpublish?.();
    entry.unpublish = getSlots(this.context).register(fragmentsSlot, entry.state.id, entry.state);
  }
}

/** Create a kernel and start it. */
export async function startKernel(options: KernelOptions = {}): Promise<Kernel> {
  const kernel = new Kernel(options);
  await kernel.start();
  return kernel;
}
