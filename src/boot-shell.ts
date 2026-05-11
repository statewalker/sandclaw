import initCoreReact from "@statewalker/core-react/fragment";
import initDock from "@statewalker/dock/fragment";
import initDockReact from "@statewalker/dock-react/fragment";
import initFiles from "@statewalker/files/fragment";
import initImageViewerReact from "@statewalker/image-viewer-react/fragment";
import initInlineContent from "@statewalker/inline-content/fragment";
import initInlineContentReact from "@statewalker/inline-content-react/fragment";
import initMarkdownViewerReact from "@statewalker/markdown-viewer-react/fragment";
import initPdfViewerReact from "@statewalker/pdf-viewer-react/fragment";
import initPlatformWeb from "@statewalker/platform-browser";
import initSettings from "@statewalker/settings/fragment";
import initSettingsReact from "@statewalker/settings-react/fragment";
import initShadcnReact from "@statewalker/shadcn-react/fragment";
import { newRegistry } from "@statewalker/shared-registry";
import initSpecStore from "@statewalker/spec-store/fragment";
import initVideoViewerReact from "@statewalker/video-viewer-react/fragment";
import { Workspace } from "@statewalker/workspace";
import initWorkspaceBridge from "@statewalker/workspace-bridge/fragment";
import initWorkspaceBridgeReact from "@statewalker/workspace-bridge-react/fragment";
import { QueryClient } from "@tanstack/react-query";
import { initMenubar } from "./menubar-init.js";
import { applyInitialTheme } from "./theme-manager.js";

/**
 * Init function shape used by every workbench fragment: takes the
 * boot context, returns a cleanup. Both sync and async cleanups are
 * accepted — the underlying registry awaits whichever shape is given.
 */
export type FragmentInit = (
  ctx: Record<string, unknown>,
) => () => void | Promise<void>;

export interface BootShellOptions {
  /**
   * App-specific logic fragments. Run AFTER the workbench substrate's
   * logic fragments (so they can `requireAdapter()` on adapters
   * registered by the substrate) but BEFORE any renderer fragment.
   */
  logic?: readonly FragmentInit[];
  /**
   * App-specific renderer fragments. Run after the substrate's
   * renderers. The React mount has already been created by
   * `core-react`'s init, so renderer fragments only contribute
   * components / catalogs / slot entries.
   */
  renderers?: readonly FragmentInit[];
  /**
   * Optional callback invoked AFTER the substrate's logic fragments
   * are registered but BEFORE the renderer phase. Useful for app-level
   * preset wiring that must precede a renderer's init-time slot
   * snapshot read (e.g. `file-explorer:panels`).
   *
   * Returns void or a cleanup; cleanups are tracked and run on
   * `beforeunload`.
   */
  onLogicReady?: (
    ctx: Record<string, unknown>,
    register: (cleanup: () => void | Promise<void>) => () => Promise<void>,
  ) => void | (() => void | Promise<void>);
  /**
   * QueryClient default options. Defaults to
   * `{ retry: false, refetchOnWindowFocus: false }`.
   */
  queryClientOptions?: ConstructorParameters<typeof QueryClient>[0];
}

export interface BootShellResult {
  workspace: Workspace;
  ctx: Record<string, unknown>;
  /** Tear down every registered fragment, in reverse order. */
  cleanup: () => Promise<void>;
}

/**
 * Boot the canonical workbench substrate and return the shared
 * `Workspace` + boot context. Apps register their own logic /
 * renderer fragments via `options.logic` and `options.renderers`.
 *
 * Order (matters):
 *   1. Substrate logic fragments — platform → json-render → dock →
 *      workspace-bridge → settings → files → inline-content.
 *   2. App-specific logic fragments (`options.logic`).
 *   3. `options.onLogicReady` hook — for slot contributions that must
 *      land before renderer inits read their snapshots.
 *   4. Substrate renderer fragments — core-react → shadcn-react →
 *      workspace-bridge-react → dock-react → settings-react →
 *      markdown/image/pdf/video viewers → inline-content-react.
 *   5. App-specific renderer fragments (`options.renderers`).
 *
 * The caller is responsible for the import-side-effect of CSS bundles
 * (e.g. `import "@statewalker/dock-react/styles"`) since CSS load order
 * matters for Tailwind/shadcn cascade and is best controlled per app.
 *
 * Returns `{ workspace, ctx, cleanup }`. The default boot also wires a
 * `beforeunload` handler that calls `cleanup()`; callers that want to
 * own teardown explicitly can drop that handler by extracting the
 * `cleanup` from the result and calling it themselves.
 */
export function bootShell(options: BootShellOptions = {}): BootShellResult {
  // Apply the persisted theme before React mounts so the first paint
  // already matches the user's choice (no light-then-dark flash).
  applyInitialTheme();

  const workspace = new Workspace();
  const queryClient = new QueryClient(
    options.queryClientOptions ?? {
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    },
  );
  const ctx: Record<string, unknown> = {
    "workspace:workspace": workspace,
    "core-react:query-client": queryClient,
  };

  const [register, cleanup] = newRegistry();

  // ── 1. Substrate logic fragments ─────────────────────────────
  register(initPlatformWeb(ctx));
  register(initSpecStore(ctx));
  register(initDock(ctx));
  register(initWorkspaceBridge(ctx));
  register(initSettings(ctx));
  register(initFiles(ctx));
  register(initInlineContent(ctx));

  // ── 2. App-specific logic fragments ──────────────────────────
  for (const init of options.logic ?? []) {
    register(init(ctx));
  }

  // ── 3. Pre-renderer hook ─────────────────────────────────────
  if (options.onLogicReady) {
    const result = options.onLogicReady(ctx, register);
    if (typeof result === "function") {
      register(result);
    }
  }

  // ── 4. Substrate renderer fragments ──────────────────────────
  // `core-react` owns the React mount (per ADR 0003); register first
  // so subsequent renderers find AppWorkspaceProvider in scope.
  register(initCoreReact(ctx));
  register(initShadcnReact(ctx));
  register(initWorkspaceBridgeReact(ctx));
  register(initDockReact(ctx));
  register(initSettingsReact(ctx));
  register(initMarkdownViewerReact(ctx));
  register(initImageViewerReact(ctx));
  register(initPdfViewerReact(ctx));
  register(initVideoViewerReact(ctx));
  register(initInlineContentReact(ctx));

  // Menubar (leading header dropdowns) + theme toggle (trailing).
  // Registered after the substrate views so view-key resolution sees
  // the populated registry.
  register(initMenubar(ctx));

  // ── 5. App-specific renderer fragments ───────────────────────
  for (const init of options.renderers ?? []) {
    register(init(ctx));
  }

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      void cleanup();
    });
  }

  return { workspace, ctx, cleanup };
}
