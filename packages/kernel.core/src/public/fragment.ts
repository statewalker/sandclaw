import type { AppContext } from "./context.js";

/** What activating a fragment may return: its teardown, or nothing. */
export type Cleanup = () => void | Promise<void>;

/**
 * The init shape every existing `<pkg>/fragment` default export has:
 * `(ctx) => cleanup`. The kernel accepts it as is (see `fromInit`).
 */
export type FragmentInit = (ctx: AppContext) => ActivateResult | Promise<ActivateResult>;

/** A cleanup, or nothing when the fragment has nothing to undo. */
// biome-ignore lint/suspicious/noConfusingVoidType: lets inits with no `return` type-check as fragments.
export type ActivateResult = Cleanup | undefined | void;

/**
 * An app fragment (plugin). Everything it adds to the app (services, views,
 * command handlers, actions) it adds in `activate`, and everything `activate`
 * added comes back with the cleanup it returns.
 */
export interface Fragment {
  /** Unique id; other fragments name it in `requires` / `after`. */
  readonly id: string;
  readonly label?: string;
  /**
   * Fragments that must be active before this one. A missing or failed
   * requirement blocks this fragment (and everything that requires it).
   */
  readonly requires?: readonly string[];
  /**
   * Soft ordering: when these fragments are part of the app, activate after
   * them; when they are not, ignore them.
   */
  readonly after?: readonly string[];
  activate: FragmentInit;
}

/** A module exporting a fragment: `export default defineFragment(...)` or a plain init. */
export interface FragmentModule {
  default?: Fragment | FragmentInit;
  fragment?: Fragment;
}

/**
 * A fragment whose code is loaded on demand. The descriptor carries the
 * metadata the kernel orders by, so nothing is imported until the fragment
 * is activated.
 *
 * @example
 *   { id: "chat", requires: ["dock"], load: () => import("@acme/chat/fragment") }
 */
export interface LazyFragment {
  readonly id: string;
  readonly label?: string;
  readonly requires?: readonly string[];
  readonly after?: readonly string[];
  load: () => Promise<FragmentModule | Fragment | FragmentInit>;
}

/** Anything the kernel can load. */
export type FragmentSource = Fragment | LazyFragment;

export function defineFragment(fragment: Fragment): Fragment {
  return Object.freeze({ ...fragment });
}

/** Wrap a plain `(ctx) => cleanup` init as a fragment. */
export function fromInit(
  id: string,
  init: FragmentInit,
  meta: Omit<Fragment, "id" | "activate"> = {},
): Fragment {
  return defineFragment({ ...meta, id, activate: init });
}

/** Load a fragment from a URL or bare specifier with a dynamic `import()`. */
export function importFragment(
  specifier: string,
  meta: Omit<LazyFragment, "load"> & { id: string },
): LazyFragment {
  return { ...meta, load: () => import(/* @vite-ignore */ specifier) };
}

export function isLazyFragment(source: FragmentSource): source is LazyFragment {
  return typeof (source as LazyFragment).load === "function";
}

/** The `activate` function a loaded module or value stands for. */
export function resolveActivate(
  id: string,
  loaded: FragmentModule | Fragment | FragmentInit,
): FragmentInit {
  if (typeof loaded === "function") return loaded;
  if (isFragment(loaded)) return loaded.activate;
  const mod = loaded as FragmentModule;
  if (mod.fragment && isFragment(mod.fragment)) return mod.fragment.activate;
  if (typeof mod.default === "function") return mod.default;
  if (mod.default && isFragment(mod.default)) return mod.default.activate;
  throw new Error(`Fragment "${id}": the loaded module exports no fragment or init function`);
}

function isFragment(value: unknown): value is Fragment {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Fragment).id === "string" &&
    typeof (value as Fragment).activate === "function"
  );
}
