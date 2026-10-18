import {
  Commands,
  CommandsRegistry,
  type MutableCommandsRegistry,
} from "@statewalker/shared-commands";
import { Slots } from "@statewalker/shared-slots";
import { type AppContext, defineContextAdapter } from "./context.js";

/**
 * The systems every app has. They are created lazily on first use, so a
 * fragment never depends on another fragment just to reach them; a host
 * can set its own instances before the kernel starts.
 */

/** The slot bus: services, views and every other contribution live here. */
export const slotsAdapter = defineContextAdapter<Slots>("kernel:slots", () => new Slots());

/** The command bus: every call between fragments goes through it. */
export const commandsAdapter = defineContextAdapter<Commands>("kernel:commands", () =>
  Commands.create(),
);

/**
 * The declarations some fragment currently answers (see `handleCommand`).
 * Menus, palettes and agent tool lists read it to offer only what works.
 */
export const handledCommandsAdapter = defineContextAdapter<MutableCommandsRegistry>(
  "kernel:handled-commands",
  () => CommandsRegistry.create(),
);

/** Minimal logger contract; hosts plug in pino or anything else. */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export const loggerAdapter = defineContextAdapter<Logger>("kernel:logger", () => console);

export function getSlots(ctx: AppContext): Slots {
  return slotsAdapter.get(ctx);
}

export function getCommands(ctx: AppContext): Commands {
  return commandsAdapter.get(ctx);
}

export function getLogger(ctx: AppContext): Logger {
  return loggerAdapter.get(ctx);
}
