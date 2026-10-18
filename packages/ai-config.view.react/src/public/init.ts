import {
  AI_CONFIG_CONNECTIONS_TAB_ID,
  AI_CONFIG_CONNECTIONS_TAB_VIEW_KEY,
  ConfigureAiCommand,
} from "@statewalker/ai-config.core";
import { OpenSettingsCommand, settingsTabSlot } from "@statewalker/settings.core";
import { Commands } from "@statewalker/shared-commands";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { coreViewsSlot, type ViewComponent } from "@statewalker/ui.view.react";
import { getWorkspace } from "@statewalker/workspace.core";
import { AiConfigConnectionsTab } from "../internal/connections-tab.js";

/**
 * Renderer-fragment init for `@statewalker/ai-config.view.react`. Pairs with the
 * React-free `@statewalker/ai-config` logic fragment:
 *
 *  1. Registers the connections-tab `ViewComponent` into `core:views` under the
 *     `ai-config:connections` viewKey.
 *  2. Contributes the single `settings:tabs` entry (Remote Models, order 20).
 *  3. Listens for `ConfigureAiCommand` and opens the settings dialog on the tab.
 */
export default function initAiConfigView(ctx: Record<string, unknown>): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);
  const commands = workspace.requireAdapter(Commands);

  const [register, cleanup] = newRegistry();

  register(
    slots.register(
      coreViewsSlot,
      AI_CONFIG_CONNECTIONS_TAB_VIEW_KEY,
      AiConfigConnectionsTab as unknown as ViewComponent,
    ),
  );

  register(
    slots.provide(settingsTabSlot, {
      id: AI_CONFIG_CONNECTIONS_TAB_ID,
      title: "Remote Models",
      viewKey: AI_CONFIG_CONNECTIONS_TAB_VIEW_KEY,
      order: 20,
    }),
  );

  register(
    commands.listen(ConfigureAiCommand, (cmd) => {
      commands
        .call(OpenSettingsCommand, { tabId: AI_CONFIG_CONNECTIONS_TAB_ID })
        .promise.then(() => cmd.resolve())
        .catch((err) => cmd.reject(err));
      return true;
    }),
  );

  return cleanup;
}
