import { newAdapter } from "@statewalker/shared-adapters";

/**
 * The app context: one plain record shared by every fragment of an app.
 *
 * Systems and configs are never read from it by key. Each one is reached
 * through a context adapter (`defineContextAdapter`), which owns its key,
 * its type and its default factory. A context may have a `parent`; lookups
 * walk up the chain, so a child context (a test, an embedded sub-app) sees
 * everything its parent holds and can override any of it locally.
 */
export type AppContext = Record<string, unknown> & { parent?: AppContext };

/** Typed accessor for one value held by the app context. */
export interface ContextAdapter<T> {
  /** The context key; unique per adapter. */
  readonly key: string;
  /**
   * The value for this adapter, searching the context and its parents.
   * When none is found and the adapter has a factory, the value is created,
   * stored on `ctx` and returned; without a factory it throws.
   */
  get(ctx: AppContext): T;
  /** Like `get`, but returns `undefined` instead of creating or throwing. */
  find(ctx: AppContext): T | undefined;
  /** Put a value on `ctx` itself (it shadows any value of a parent). */
  set(ctx: AppContext, value: T): void;
  /** Remove the value stored on `ctx` itself. */
  remove(ctx: AppContext): void;
}

/**
 * Declare a context adapter. `create` is the lazy default: systems that every
 * app needs (slots, commands, config) have one, values that only a host can
 * supply (a workspace, a platform) do not.
 *
 * @example
 *   export const clockAdapter = defineContextAdapter<Clock>("app:clock", () => new SystemClock());
 *   const clock = clockAdapter.get(ctx);
 */
export function defineContextAdapter<T>(
  key: string,
  create?: (ctx: AppContext) => T,
): ContextAdapter<T> {
  const [get, set, remove] = newAdapter<T, AppContext>(key, create);
  const [find] = newAdapter<T, AppContext>(key);
  return Object.freeze({
    key,
    get: (ctx: AppContext) => get(ctx),
    find: (ctx: AppContext) => find(ctx, true),
    set,
    remove,
  });
}

/** A fresh app context, optionally nested under `parent`. */
export function createAppContext(parent?: AppContext): AppContext {
  return parent ? { parent } : {};
}
