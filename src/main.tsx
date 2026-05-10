import initAgentRuntime from "@statewalker/ai-agent-runtime/fragment";
import initProviders from "@statewalker/ai-providers/fragment";
import initProvidersReact from "@statewalker/ai-providers-react/fragment";
import "@statewalker/ai-providers-react/styles";
import initCoreReact from "@statewalker/core-react/fragment";
import "@statewalker/core-react/styles";
import initDock from "@statewalker/dock/fragment";
import initDockReact from "@statewalker/dock-react/fragment";
import "@statewalker/dock-react/styles";
import initFiles from "@statewalker/files/fragment";
import initImageViewerReact from "@statewalker/image-viewer-react/fragment";
import "@statewalker/image-viewer-react/styles";
import initInlineContent from "@statewalker/inline-content/fragment";
import initInlineContentReact from "@statewalker/inline-content-react/fragment";
import "@statewalker/inline-content-react/styles";
import initJsonRender from "@statewalker/json-render/fragment";
import initMarkdownViewerReact from "@statewalker/markdown-viewer-react/fragment";
import "@statewalker/markdown-viewer-react/styles";
import initPdfViewerReact from "@statewalker/pdf-viewer-react/fragment";
import "@statewalker/pdf-viewer-react/styles";
import initSettings from "@statewalker/settings/fragment";
import initSettingsReact from "@statewalker/settings-react/fragment";
import "@statewalker/settings-react/styles";
import initShadcnReact from "@statewalker/shadcn-react/fragment";
import "@statewalker/shadcn-react/styles";
import initVideoViewerReact from "@statewalker/video-viewer-react/fragment";
import "@statewalker/video-viewer-react/styles";
import initWorkspaceBridge from "@statewalker/workspace-bridge/fragment";
import initWorkspaceBridgeReact from "@statewalker/workspace-bridge-react/fragment";
import "@statewalker/workspace-bridge-react/styles";
import initPlatformWeb from "@statewalker/platform-browser";
import { newRegistry } from "@statewalker/shared-registry";
import { Workspace } from "@statewalker/workspace-api";
import { QueryClient } from "@tanstack/react-query";
import initChat from "@repo/chat-mini.chat/fragment";
import initChatReact from "@repo/chat-mini.chat-react/fragment";
import "@repo/chat-mini.chat-react/styles";
import "@/index.css";

// Pure boot script — no JSX, no React imports. The React mount is owned by
// `@statewalker/core-react`'s init (per ADR 0003). `main.tsx` only:
//   1. Builds the Workspace and the boot context.
//   2. Registers logic fragments first, then renderer fragments.
//   3. Attaches the existing `beforeunload` cleanup hook.
const workspace = new Workspace();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
const ctx: Record<string, unknown> = {
  "workspace:workspace": workspace,
  "core-react:query-client": queryClient,
};

const [register, cleanup] = newRegistry();

// ── Logic fragments ─────────────────────────────────
register(initPlatformWeb(ctx));
register(initJsonRender(ctx)); // catalog-registry + spec-store
register(initDock(ctx));
register(initWorkspaceBridge(ctx));
register(initAgentRuntime(ctx));
register(initSettings(ctx));
register(initProviders(ctx));
register(initFiles(ctx));
register(initInlineContent(ctx));
register(initChat(ctx));

// ── Renderer fragments register after logic fragments (ADR 0002) ──
// `core-react`'s init owns the React mount via `createRoot(...).render(<AppRoot/>)`.
// `shadcn-react` is registered between `core-react` and `workspace-bridge-react`
// so the shadcn primitives are available before any other renderer mounts.
register(initCoreReact(ctx));
register(initShadcnReact(ctx));
register(initWorkspaceBridgeReact(ctx));
register(initDockReact(ctx));
register(initSettingsReact(ctx));
register(initProvidersReact(ctx));
register(initMarkdownViewerReact(ctx));
register(initImageViewerReact(ctx));
register(initPdfViewerReact(ctx));
register(initVideoViewerReact(ctx));
register(initInlineContentReact(ctx));
register(initChatReact(ctx));

window.addEventListener("beforeunload", () => {
  void cleanup();
});
