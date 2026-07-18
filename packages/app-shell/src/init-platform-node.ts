import {
  getCommands,
  PreferenceGetCommand,
  PreferenceSetCommand,
} from "@statewalker/platform.core";
import { newRegistry } from "@statewalker/shared-registry";

/**
 * Minimal headless / Node implementation of the `platform:*` capability
 * surface — a STUB standing in for a future `@statewalker/platform-node`
 * package. It registers only the durable-preference commands, backed by an
 * in-process `Map` (no persistence across process restarts).
 *
 * The browser-only capabilities — `pick-directory`, `pick-file`,
 * `download-blob`, `copy-to-clipboard`, `download-to-files`, and URL-state
 * binding — are intentionally NOT registered: a headless caller of those gets
 * a `no-handlers` outcome, which is the honest signal that the capability is
 * unavailable outside a browser. A real `platform-node` replaces this with
 * filesystem-backed preferences and node equivalents where they make sense.
 */
export default function initPlatformNode(ctx: Record<string, unknown>): () => void {
  const [register, cleanup] = newRegistry();
  const commands = getCommands(ctx);
  const store = new Map<string, unknown>();

  register(
    commands.listen(PreferenceGetCommand, (command) => {
      command.resolve({ value: store.get(command.payload.key) });
      return true;
    }),
  );
  register(
    commands.listen(PreferenceSetCommand, (command) => {
      store.set(command.payload.key, command.payload.value);
      command.resolve(undefined);
      return true;
    }),
  );

  return cleanup;
}
