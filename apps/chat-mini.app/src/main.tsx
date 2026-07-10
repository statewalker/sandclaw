import initChat from "@statewalker/chat-mini.chat/fragment";
import initChatReact from "@statewalker/chat-mini.chat-react/fragment";
import "@statewalker/chat-mini.chat-react/styles";
import { bootShell } from "@statewalker/app-shell";
import initAgentRuntime from "@statewalker/ai-agent-runtime.core/fragment";
import initAiConfig from "@statewalker/ai-config.core/fragment";
import initAiConfigView from "@statewalker/ai-config.view.react/fragment";
import "@statewalker/ai-config.view.react/styles";
import initAiLocalModels from "@statewalker/ai-local-models.core/fragment";
import initAiLocalModelsReact from "@statewalker/ai-local-models.view.react/fragment";
import "@statewalker/ai-local-models.view.react/styles";
import initFileExplorer from "@statewalker/explorer.core/fragment";
import initFileExplorerReact from "@statewalker/explorer.view.react/fragment";
import "@statewalker/explorer.view.react/styles";
import initWikiReact from "@statewalker/wiki.view.react/fragment";
import "@statewalker/wiki.view.react/styles";
import initActiveModelProjection from "./init-active-model-projection.js";
import initComposerPicker from "./init-composer-picker.js";
import initChatMenu from "./init-chat-menu.js";
import initFilesMenu from "./init-files-menu.js";
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
 * chat-mini.app boot. The shared workbench substrate is registered by
 * `@statewalker/app-shell`'s `bootShell`; this script only contributes the
 * AI / chat fragments on top.
 *
 * Logic boot order: agent-runtime, ai-config (+ its active-model
 * projection), ai-local-models, chat.
 */
// PROTOTYPE gate: when `?prototype=connections` is in the URL, mount the
// throwaway connections-redesign prototype instead of booting the real app.
if (!maybeMountConnectionsPrototype()) {
  bootShell({
    logic: [
      initAgentRuntime,
      initAiConfig,
      initActiveModelProjection,
      initAiLocalModels,
      initChat,
      initFileExplorer,
      initWiki,
    ],
    onLogicReady: (ctx, register) => {
      register(initChatMenu(ctx));
      register(initFilesMenu(ctx));
      register(initWikiMenu(ctx));
    },
    renderers: [
      initAiConfigView,
      initAiLocalModelsReact,
      initComposerPicker,
      initChatReact,
      initFileExplorerReact,
      initWikiReact,
    ],
  });
}
