import initPlatformWeb from "@statewalker/platform-browser";
import { newRegistry } from "@statewalker/shared-registry";
import { Workspace } from "@statewalker/workspace-api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app";
import { AppWorkspaceProvider } from "@/contexts/app-workspace-context";
import initCatalogRegistry from "@/fragments/catalog-registry";
import initChat from "@/fragments/chat";
import initChatViews from "@/fragments/chat-views";
import initDock from "@/fragments/dock";
import initDockViews from "@/fragments/dock-views";
import initSpecStore from "@/fragments/spec-store";
import "@/index.css";

// WebLLM weight-bridge Service Worker registration — disabled while
// WebLLM is commented out. Re-enable together with the WebLLM imports
// in workspace-context.tsx / runtime-context.tsx.
// if ("serviceWorker" in navigator) {
//   navigator.serviceWorker
//     .register("/webllm-weight-bridge.sw.js", { type: "module" })
//     .catch((error) => {
//       console.warn("[chat-mini] SW registration failed:", error);
//     });
// }

const container = document.getElementById("app");
if (!container) {
  throw new Error("Root element #app not found");
}

void bootstrap(container);

async function bootstrap(root: HTMLElement): Promise<void> {
  const workspace = new Workspace();
  const ctx: Record<string, unknown> = { "workspace:workspace": workspace };

  // ── Plug-ins-first registration convention ───────────────────
  // Third-party fragment `init`s should register BEFORE built-in
  // fragment `init`s, so plug-in handlers register first and claim
  // first per the `Intents` "first claim wins" rule. Built-ins
  // serve as the fallback chain. v1 ships no third-party
  // fragments, but the boot sequence below honors the convention
  // so the future plug-in-system change has a clear contract:
  // append a `register(initPluginX(ctx))` line BEFORE the built-in
  // block to make X override the built-in handler for any intent
  // it claims.
  const [register, cleanup] = newRegistry();

  // ── Built-in fragments (last to register, last to claim) ─────
  register(initPlatformWeb(ctx));
  register(initCatalogRegistry(ctx));
  register(initSpecStore(ctx));
  register(initDock(ctx));
  register(initChat(ctx));
  // ── Renderer fragments register after logic fragments (ADR 0002) ──
  register(initDockViews(ctx));
  register(initChatViews(ctx)); // binds React ChatRoot to the chat catalog

  // NOTE: `workspace.open()` is intentionally NOT called here.
  // It would require `setFileSystem(filesApi, label)` first, but
  // chat-mini's FilesApi is created lazily by the existing
  // WorkspaceContext provider only after the user picks a
  // directory. None of the substrate adapters (Slots, Intents,
  // SpecStore, CatalogRegistry, DockHost) require `open()` —
  // `requireAdapter` auto-instantiates them on first use.
  // The FilesApi-aware bridge that calls `setFileSystem` +
  // `open()` lands with §7 (MainShell DockView rewire), where
  // future fragments will subscribe to `workspace.onLoad`.

  window.addEventListener("beforeunload", () => {
    void cleanup();
  });

  createRoot(root).render(
    <StrictMode>
      <AppWorkspaceProvider workspace={workspace}>
        <App />
      </AppWorkspaceProvider>
    </StrictMode>,
  );
}
