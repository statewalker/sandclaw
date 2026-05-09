import initPlatformWeb from "@statewalker/platform-browser";
import { newRegistry } from "@statewalker/shared-registry";
import { Workspace } from "@statewalker/workspace-api";
import { QueryClient } from "@tanstack/react-query";
import initAgentRuntime from "@/fragments/agent-runtime";
import initCatalogRegistry from "@/fragments/catalog-registry";
import initChat from "@/fragments/chat";
import initChatViews from "@/fragments/chat-views";
import initCoreViews from "@/fragments/core-views";
import initDock from "@/fragments/dock";
import initDockViews from "@/fragments/dock-views";
import initFiles from "@/fragments/files";
import initImageViewer from "@/fragments/image-viewer";
import initImageViewerViews from "@/fragments/image-viewer-views";
import initInlineContent from "@/fragments/inline-content";
import initInlineContentViews from "@/fragments/inline-content-views";
import initMarkdownViewer from "@/fragments/markdown-viewer";
import initMarkdownViewerViews from "@/fragments/markdown-viewer-views";
import initPdfViewer from "@/fragments/pdf-viewer";
import initPdfViewerViews from "@/fragments/pdf-viewer-views";
import initProviders from "@/fragments/providers";
import initProvidersViews from "@/fragments/providers-views";
import initSettings from "@/fragments/settings";
import initSettingsViews from "@/fragments/settings-views";
import initShadcnViews from "@/fragments/shadcn-views";
import initSpecStore from "@/fragments/spec-store";
import initVideoViewer from "@/fragments/video-viewer";
import initVideoViewerViews from "@/fragments/video-viewer-views";
import initWorkspaceBridge from "@/fragments/workspace-bridge";
import initWorkspaceBridgeViews from "@/fragments/workspace-bridge-views";
import "@/index.css";

// Pure boot script — no JSX, no React imports. The React mount is
// owned by `core-views`' init (per ADR 0003). `main.tsx` only:
//   1. Builds the Workspace and the boot context.
//   2. Registers logic fragments first (existing order), then renderer
//      fragments (existing order with `shadcn-views` inserted between
//      `core-views` and `workspace-bridge-views` so primitives are
//      available before any other renderer mounts).
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
  "core-views:query-client": queryClient,
};

const [register, cleanup] = newRegistry();

// ── Logic fragments (last to register, last to claim per the
// "first claim wins" intents convention) ─────────────────────
register(initPlatformWeb(ctx));
register(initCatalogRegistry(ctx));
register(initSpecStore(ctx));
register(initDock(ctx));
register(initWorkspaceBridge(ctx));
register(initAgentRuntime(ctx));
register(initSettings(ctx));
register(initProviders(ctx));
register(initFiles(ctx));
register(initMarkdownViewer(ctx));
register(initImageViewer(ctx));
register(initPdfViewer(ctx));
register(initVideoViewer(ctx));
register(initInlineContent(ctx));
register(initChat(ctx));

// ── Renderer fragments register after logic fragments (ADR 0002) ──
// `shadcn-views` is registered between `core-views` and
// `workspace-bridge-views` so the shadcn primitives are available
// before any other renderer mounts. `core-views`' init owns the
// React mount via `createRoot(...).render(<AppRoot/>)`.
register(initCoreViews(ctx));
register(initShadcnViews(ctx));
register(initWorkspaceBridgeViews(ctx));
register(initDockViews(ctx));
register(initSettingsViews(ctx));
register(initProvidersViews(ctx));
register(initMarkdownViewerViews(ctx));
register(initImageViewerViews(ctx));
register(initPdfViewerViews(ctx));
register(initVideoViewerViews(ctx));
register(initInlineContentViews(ctx));
register(initChatViews(ctx));

window.addEventListener("beforeunload", () => {
  void cleanup();
});
