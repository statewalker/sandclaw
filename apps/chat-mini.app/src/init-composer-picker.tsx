import { composerActionsSlot } from "@statewalker/chat-mini.chat";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { coreViewsSlot, type ViewComponent } from "@statewalker/ui.view.react";
import { getWorkspace } from "@statewalker/workspace.core";
import { ComposerModelPicker } from "./composer-model-picker.js";

/** ViewKey for the composer's session-model picker. */
const COMPOSER_PICKER_VIEW_KEY = "chat-mini:composer-picker";

/**
 * Renderer fragment mounting the composer session-model picker. Owns both the
 * `composer:actions` slot entry (where it sits in the composer) and the
 * `core:views` component registration under that viewKey. The picker is an
 * app-level concern: it composes the chat session context with the workbench
 * `AiConfig`, so it lives here rather than in a workbench package.
 */
export default function initComposerPicker(ctx: Record<string, unknown>): () => Promise<void> {
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);

  const [register, cleanup] = newRegistry();

  register(
    slots.provide(composerActionsSlot, {
      id: "chat-mini:picker",
      viewKey: COMPOSER_PICKER_VIEW_KEY,
      position: "leading",
      order: 10,
    }),
  );

  register(
    slots.register(
      coreViewsSlot,
      COMPOSER_PICKER_VIEW_KEY,
      ComposerModelPicker as unknown as ViewComponent,
    ),
  );

  return cleanup;
}
