import type {
  Command,
  CommandDeclaration,
  MutableCommandsRegistry,
} from "@statewalker/shared-commands";
import { defineSlot } from "@statewalker/shared-slots";
import type { AppContext } from "./context.js";
import { getCommands, getSlots, handledCommandsAdapter } from "./systems.js";

/**
 * Fragments call each other only through commands. A command is declared
 * once (`Command.async(key)...build()` from `@statewalker/shared-commands`),
 * answered by whichever fragment owns it, and called by anyone.
 */

export interface HandleCommandOptions {
  /** Higher runs first; negative values are fallbacks. Default `0`. */
  priority?: number;
}

const handledCounts = new WeakMap<MutableCommandsRegistry, Map<string, number>>();

/**
 * Answer `decl` with `handler` and record the command as handled. The value
 * (or promise) `handler` returns settles the call; a throw rejects it.
 * Returns the disposer; the command stays listed as handled until the last
 * of its handlers is disposed.
 */
export function handleCommand<P, R>(
  ctx: AppContext,
  decl: CommandDeclaration<P, R>,
  handler: (payload: P, cmd: Command<P, R>) => R | Promise<R>,
  options: HandleCommandOptions = {},
): () => void {
  const stop = getCommands(ctx).listen(
    decl,
    (cmd) => {
      try {
        return Promise.resolve(handler(cmd.payload, cmd));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    { priority: options.priority },
  );
  const handled = handledCommandsAdapter.get(ctx);
  let counts = handledCounts.get(handled);
  if (!counts) {
    counts = new Map();
    handledCounts.set(handled, counts);
  }
  counts.set(decl.key, (counts.get(decl.key) ?? 0) + 1);
  handled.set(decl as CommandDeclaration<unknown, unknown>);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    stop();
    const left = (counts.get(decl.key) ?? 1) - 1;
    if (left > 0) {
      counts.set(decl.key, left);
    } else {
      counts.delete(decl.key);
      handled.remove(decl.key);
    }
  };
}

/** Call `decl` and wait for its result. */
export function callCommand<P, R>(
  ctx: AppContext,
  decl: CommandDeclaration<P, R>,
  payload: P,
): Promise<R> {
  return getCommands(ctx).call(decl, payload).promise;
}

/** Whether some fragment currently answers `decl` through `handleCommand`. */
export function isHandled(ctx: AppContext, decl: { key: string }): boolean {
  return handledCommandsAdapter.get(ctx).get(decl.key) !== undefined;
}

/**
 * A user-facing action: a command plus the payload to call it with and
 * where to show it. Menus, toolbars, palettes and shortcuts all read the
 * same slot, so an action is declared once and never carries a callback.
 */
export interface Action {
  id: string;
  // biome-ignore lint/suspicious/noExplicitAny: an action erases its payload type; `defineAction` checks it.
  command: CommandDeclaration<any, unknown>;
  payload: unknown;
  label: string;
  /** Top-level menu the action belongs to (e.g. "File"); omitted for palette-only actions. */
  menu?: string;
  /** Lower first; default 100. */
  order?: number;
  /** Renderer-specific icon (a component for React renderers); the kernel never reads it. */
  icon?: unknown;
  /** Shortcut such as "Mod+Shift+P". */
  shortcut?: string;
}

export const actionsSlot = defineSlot<Action>("kernel:actions");

/** Build an action whose payload is checked against its command. */
export function defineAction<P>(
  command: CommandDeclaration<P, unknown>,
  payload: P,
  action: Omit<Action, "command" | "payload">,
): Action {
  return { ...action, command, payload };
}

/** Contribute `action`. Returns the disposer. */
export function provideAction(ctx: AppContext, action: Action): () => void {
  return getSlots(ctx).provide(actionsSlot, action);
}

/** Run an action: call its command with its payload. */
export function runAction(ctx: AppContext, action: Action): Promise<unknown> {
  return callCommand(ctx, action.command, action.payload);
}
