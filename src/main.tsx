import initChat from "@repo/chat-mini.chat/fragment";
import initChatReact from "@repo/chat-mini.chat-react/fragment";
import "@repo/chat-mini.chat-react/styles";
import { bootShell } from "@repo/app-shell";
import initAgentRuntime from "@statewalker/ai-agent-runtime/fragment";
import initProviders from "@statewalker/ai-providers/fragment";
import initProvidersReact from "@statewalker/ai-providers-react/fragment";
import "@statewalker/ai-providers-react/styles";
import "@statewalker/core-react/styles";
import "@statewalker/dock-react/styles";
import "@statewalker/image-viewer-react/styles";
import "@statewalker/inline-content-react/styles";
import "@statewalker/markdown-viewer-react/styles";
import "@statewalker/pdf-viewer-react/styles";
import "@statewalker/settings-react/styles";
import "@statewalker/shadcn-react/styles";
import "@statewalker/video-viewer-react/styles";
import "@statewalker/workspace-bridge-react/styles";
import "@/index.css";

/**
 * chat-mini.app boot. The shared workbench substrate is registered by
 * `@repo/app-shell`'s `bootShell`; this script only contributes the
 * AI / chat fragments on top.
 */
bootShell({
  logic: [initAgentRuntime, initProviders, initChat],
  renderers: [initProvidersReact, initChatReact],
});
