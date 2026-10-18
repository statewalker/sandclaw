import initChat from "@statewalker/chat-mini.chat/fragment";
import initChatReact from "@statewalker/chat-mini.chat-react/fragment";
import "@statewalker/chat-mini.chat-react/styles";
import initAgentRuntime from "@statewalker/ai-agent-runtime.core/fragment";
import initAiConfig from "@statewalker/ai-config.core/fragment";
import initAiConfigView from "@statewalker/ai-config.view.react/fragment";
import { bootShell, SUBSTRATE } from "@statewalker/app-shell";
import "@statewalker/ai-config.view.react/styles";
import initAiLocalModels from "@statewalker/ai-local-models.core/fragment";
import initAiLocalModelsReact from "@statewalker/ai-local-models.view.react/fragment";
import "@statewalker/ai-local-models.view.react/styles";
import initFileExplorer from "@statewalker/explorer.core/fragment";
import initFileExplorerReact from "@statewalker/explorer.view.react/fragment";
import { type FragmentSource, fromInit } from "@statewalker/kernel.core";
import "@statewalker/explorer.view.react/styles";
import initWikiReact from "@statewalker/wiki.view.react/fragment";
import "@statewalker/wiki.view.react/styles";
import initActiveModelProjection from "./init-active-model-projection.js";
import initChatMenu from "./init-chat-menu.js";
import initComposerPicker from "./init-composer-picker.js";
import initFilesMenu from "./init-files-menu.js";
import initNewSession from "./init-new-session.js";
import initWiki from "./init-wiki.js";
import initWikiMenu from "./init-wiki-menu.js";
import "@statewalker/ui.view.react/styles";
import "@statewalker/shell.view.react/styles";
import "@statewalker/mime.view.image/styles";
import "@statewalker/inline.view.react/styles";
import "@statewalker/mime.view.markdown/styles";
import "@statewalker/mime.view.pdf/styles";
import "@statewalker/settings.view.react/styles";
import "@statewalker/ui.view.shadcn/styles";
import "@statewalker/mime.view.video/styles";
import "@statewalker/workspace.view.react/styles";
import "@/index.css";
// PROTOTYPE — throwaway connections-panel redesign. Remove this import and the
// guarded early-return below once a variant is chosen. See ./prototype-connections.
import { maybeMountConnectionsPrototype } from "./prototype-connections/index.js";

/**
 * chat-mini.app boot. `@statewalker/app-shell`'s `bootShell` runs the shared
 * workbench substrate through the kernel; this script lists the app's own
 * fragments. Each fragment names what it needs, so the kernel orders them
 * and a fragment that fails only takes down the fragments that require it.
 */
const fragments: FragmentSource[] = [
  // ── logic ──
  fromInit("ai.agent-runtime", initAgentRuntime, { requires: [SUBSTRATE.workspace] }),
  fromInit("ai.config", initAiConfig, { requires: [SUBSTRATE.settings] }),
  fromInit("ai.active-model", initActiveModelProjection, {
    requires: ["ai.config", "ai.agent-runtime"],
  }),
  fromInit("ai.local-models", initAiLocalModels, { requires: ["ai.config"] }),
  fromInit("chat", initChat, { requires: [SUBSTRATE.dock, SUBSTRATE.specStore] }),
  fromInit("chat.new-session", initNewSession, { requires: ["chat", "ai.agent-runtime"] }),
  fromInit("explorer", initFileExplorer, { requires: [SUBSTRATE.mime] }),
  fromInit("wiki", initWiki, { requires: ["ai.config", "ai.agent-runtime"] }),
  // ── menus: actions over commands ──
  fromInit("chat.menu", initChatMenu, { requires: ["chat.new-session"] }),
  fromInit("explorer.menu", initFilesMenu, { requires: ["explorer"] }),
  fromInit("wiki.menu", initWikiMenu, { requires: ["wiki", "chat.new-session"] }),
  // ── renderers ──
  fromInit("ai.config.view", initAiConfigView, {
    requires: [SUBSTRATE.react, SUBSTRATE.settingsReact, "ai.config"],
  }),
  fromInit("ai.local-models.view", initAiLocalModelsReact, {
    requires: [SUBSTRATE.react, "ai.local-models"],
  }),
  fromInit("chat.composer-picker", initComposerPicker, { requires: [SUBSTRATE.react, "chat"] }),
  fromInit("chat.view", initChatReact, { requires: [SUBSTRATE.dockReact, "chat"] }),
  fromInit("explorer.view", initFileExplorerReact, { requires: [SUBSTRATE.dockReact, "explorer"] }),
  fromInit("wiki.view", initWikiReact, { requires: [SUBSTRATE.dockReact, "wiki"] }),
];

// PROTOTYPE gate: when `?prototype=connections` is in the URL, mount the
// throwaway connections-redesign prototype instead of booting the real app.
if (!maybeMountConnectionsPrototype()) {
  bootShell({ fragments });
}
