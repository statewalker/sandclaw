import initChat from "@repo/chat-mini.chat/fragment";
import initChatReact from "@repo/chat-mini.chat-react/fragment";
import "@repo/chat-mini.chat-react/styles";
import { bootShell } from "@repo/app-shell";
import initAgentRuntime from "@statewalker/ai-agent-runtime/fragment";
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

/**
 * chat-mini.app boot. The shared workbench substrate is registered by
 * `@repo/app-shell`'s `bootShell`; this script only contributes the
 * AI / chat fragments on top.
 *
 * Logic boot order: agent-runtime, providers, models-config (depends
 * on the prior two), chat.
 */
bootShell({
  logic: [initAgentRuntime, initProviders, initModelsConfig, initChat],
  renderers: [initModelsConfigReact, initChatReact],
});
