import { type AppContext, defineContextAdapter } from "./context.js";

/**
 * A typed section of the app configuration. Each fragment that can be
 * configured declares its section with defaults; the host supplies values
 * for any section by key, and the fragment reads the merged result.
 */
export interface ConfigDeclaration<T extends object> {
  readonly key: string;
  readonly defaults: Readonly<T>;
}

export function defineConfig<T extends object>(key: string, defaults: T): ConfigDeclaration<T> {
  return Object.freeze({ key, defaults: Object.freeze({ ...defaults }) });
}

/**
 * The app configuration: raw values by section key, as the host passed them,
 * plus whatever was set at runtime. Sections are merged over their defaults
 * shallowly, so a host only names the fields it changes.
 */
export class AppConfig {
  private readonly values = new Map<string, Record<string, unknown>>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly snapshots = new Map<string, unknown>();

  constructor(values: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(values)) {
      if (value && typeof value === "object") this.values.set(key, { ...value });
    }
  }

  /** The section's values merged over its defaults. Stable until the section changes. */
  get<T extends object>(decl: ConfigDeclaration<T>): Readonly<T> {
    const cached = this.snapshots.get(decl.key);
    if (cached) return cached as T;
    const merged = Object.freeze({ ...decl.defaults, ...this.values.get(decl.key) }) as T;
    this.snapshots.set(decl.key, merged);
    return merged;
  }

  /** Patch a section and notify its observers. */
  set<T extends object>(decl: ConfigDeclaration<T>, patch: Partial<T>): void {
    this.values.set(decl.key, { ...this.values.get(decl.key), ...patch });
    this.snapshots.delete(decl.key);
    for (const listener of [...(this.listeners.get(decl.key) ?? [])]) listener();
  }

  /** Call `cb` with the section now and after every change. Returns the disposer. */
  observe<T extends object>(
    decl: ConfigDeclaration<T>,
    cb: (value: Readonly<T>) => void,
  ): () => void {
    let set = this.listeners.get(decl.key);
    if (!set) {
      set = new Set();
      this.listeners.set(decl.key, set);
    }
    const listener = () => cb(this.get(decl));
    set.add(listener);
    listener();
    return () => {
      set.delete(listener);
    };
  }
}

export const configAdapter = defineContextAdapter<AppConfig>(
  "kernel:config",
  () => new AppConfig(),
);

/** Shorthand for `configAdapter.get(ctx).get(decl)`. */
export function getConfig<T extends object>(
  ctx: AppContext,
  decl: ConfigDeclaration<T>,
): Readonly<T> {
  return configAdapter.get(ctx).get(decl);
}
