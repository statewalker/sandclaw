import {
  type AppContext,
  createAppContext,
  type Fragment,
  type FragmentInit,
  type FragmentSource,
  fromInit,
  getCommands,
  getSlots,
  Kernel,
  type KernelOptions,
} from "@statewalker/kernel.core";
import { Commands } from "@statewalker/shared-commands";
import { Slots } from "@statewalker/shared-slots";
import type { Workspace } from "@statewalker/workspace.core";

export type { FragmentInit } from "@statewalker/kernel.core";

/** Registers a cleanup with the boot; returns the function that runs it early. */
export type Register = (cleanup: () => void | Promise<void>) => () => Promise<void>;

export interface AppFragmentOptions {
  /**
   * App fragments. Each one has an id and names what it needs in `requires`
   * (substrate ids are in `SUBSTRATE`); lazy fragments are imported only when
   * activated. They are listed right after the logic substrate, so a renderer
   * fragment `requires: [SUBSTRATE.react]` (or the substrate view it builds
   * on) to come after the React mount.
   */
  fragments?: readonly FragmentSource[];
  /** Configuration sections by key (see `defineConfig` in `@statewalker/kernel.core`). */
  config?: KernelOptions["config"];
  /** Called for each fragment that fails to load, activate or deactivate. */
  onError?: KernelOptions["onError"];
  /**
   * @deprecated List the app's logic as `fragments` with ids. Plain inits
   * given here run right after the substrate logic, in order.
   */
  logic?: readonly FragmentInit[];
  /**
   * @deprecated Use a fragment that `requires` what it waits for. Runs after
   * `logic` and before every renderer.
   */
  onLogicReady?: (
    ctx: Record<string, unknown>,
    register: Register,
  ) => void | (() => void | Promise<void>);
}

export interface BootShellResult {
  workspace: Workspace;
  /** The app context every fragment received. */
  ctx: AppContext;
  /** The kernel running the app: load or unload fragments at runtime through it. */
  kernel: Kernel;
  /**
   * Settles once every fragment has been activated. Synchronous fragments
   * are already active when `bootShell` returns; this only waits for lazy or
   * asynchronous ones.
   */
  ready: Promise<void>;
  /** Tear down every fragment, in reverse activation order. */
  cleanup: () => Promise<void>;
}

/**
 * Create the app context for a workspace: the workspace is reachable with
 * `getWorkspace(ctx)`, and the workspace's `Slots` / `Commands` adapters are
 * the kernel's buses, so fragments that use `workspace.requireAdapter(Slots)`
 * and fragments that use `getSlots(ctx)` share one bus.
 */
export function createWorkspaceContext(workspace: Workspace): AppContext {
  const ctx = createAppContext();
  ctx["workspace:workspace"] = workspace;
  workspace.setAdapter(Slots, () => getSlots(ctx));
  workspace.setAdapter(Commands, () => getCommands(ctx));
  return ctx;
}

/** The deprecated `logic` / `onLogicReady` / `renderers` options, as fragments. */
export function legacyFragments(
  kind: "logic" | "renderer",
  inits: readonly FragmentInit[] | undefined,
): Fragment[] {
  return (inits ?? []).map((init, i) => fromInit(`app.${kind}:${i}:${init.name || "init"}`, init));
}

export function onLogicReadyFragment(hook: AppFragmentOptions["onLogicReady"]): Fragment[] {
  if (!hook) return [];
  return [
    // Synchronous on purpose: the renderers after it start in the same tick.
    fromInit("app.on-logic-ready", (ctx) => {
      const cleanups: Array<() => void | Promise<void>> = [];
      const register: Register = (cleanup) => {
        cleanups.push(cleanup);
        return async () => {
          const i = cleanups.indexOf(cleanup);
          if (i >= 0) cleanups.splice(i, 1);
          await cleanup();
        };
      };
      const result = hook(ctx, register);
      if (typeof result === "function") cleanups.push(result);
      return async () => {
        for (const cleanup of cleanups.reverse()) await cleanup();
      };
    }),
  ];
}

export function startApp(
  ctx: AppContext,
  workspace: Workspace,
  fragments: FragmentSource[],
  options: AppFragmentOptions,
): BootShellResult {
  const kernel = new Kernel({
    context: ctx,
    config: options.config,
    onError: options.onError,
    fragments,
  });
  const ready = kernel.start();
  return { workspace, ctx, kernel, ready, cleanup: () => kernel.stop() };
}
