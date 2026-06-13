import initChat from "@repo/chat-mini.chat/fragment";
import initChatReact from "@repo/chat-mini.chat-react/fragment";
import "@repo/chat-mini.chat-react/styles";
import { bootShell } from "@repo/app-shell";
import initAgentRuntime from "@statewalker/ai-agent-runtime/fragment";
import initAiConfig from "@statewalker/ai-config/fragment";
import initAiConfigView from "@statewalker/ai-config.view.react/fragment";
import "@statewalker/ai-config.view.react/styles";
import initProviders from "@statewalker/ai-providers/fragment";
import initModelsConfig from "@statewalker/models-config/fragment";
import initModelsConfigReact from "@statewalker/models-config-react/fragment";
import "@statewalker/models-config-react/styles";
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
 * `@repo/app-shell`'s `bootShell`; this script only contributes the
 * AI / chat fragments on top.
 *
 * Logic boot order: agent-runtime, providers, models-config (depends
 * on the prior two), chat.
 */
// PROTOTYPE gate: when `?prototype=connections` is in the URL, mount the
// throwaway connections-redesign prototype instead of booting the real app.
if (!maybeMountConnectionsPrototype()) {
  bootShell({
    logic: [initAgentRuntime, initProviders, initAiConfig, initModelsConfig, initChat],
    renderers: [initAiConfigView, initModelsConfigReact, initChatReact],
  });
}
