import initInlineContent from "@statewalker/inline.core/fragment";
import initInlineContentReact from "@statewalker/inline.view.react/fragment";
import initFiles from "@statewalker/mime.core/fragment";
import initImageViewerReact from "@statewalker/mime.view.image/fragment";
import initMarkdownViewerReact from "@statewalker/mime.view.markdown/fragment";
import initPdfViewerReact from "@statewalker/mime.view.pdf/fragment";
import initVideoViewerReact from "@statewalker/mime.view.video/fragment";
import initPlatformWeb from "@statewalker/platform.browser";
import initSpecStore from "@statewalker/render.core/fragment";
import initSettings from "@statewalker/settings.core/fragment";
import initSettingsReact from "@statewalker/settings.view.react/fragment";
import { newRegistry } from "@statewalker/shared-registry";
import initDock from "@statewalker/shell.core/fragment";
import initDockReact from "@statewalker/shell.view.react/fragment";
import initCoreReact from "@statewalker/ui.view.react/fragment";
import initShadcnReact from "@statewalker/ui.view.shadcn/fragment";
import type { FilesApi } from "@statewalker/webrun-files";
import initWorkspaceBridge from "@statewalker/workspace.browser/fragment";
import { getWorkspace, Workspace } from "@statewalker/workspace.core";
import initWorkspaceFiles from "@statewalker/workspace.core/files-fragment";
import initWorkspaceBridgeReact from "@statewalker/workspace.view.react/fragment";
import { QueryClient } from "@tanstack/react-query";
import initPlatformNode from "./init-platform-node.js";
import { initMenubar } from "./menubar-init.js";
import { applyInitialTheme } from "./theme-manager.js";

/**
 * Init function shape used by every workbench fragment: takes the
 * boot context, returns a cleanup. Both sync and async cleanups are
 * accepted — the underlying registry awaits whichever shape is given.
 */
export type FragmentInit = (ctx: Record<string, unknown>) => () => void | Promise<void>;

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

/** The registrar returned by `newRegistry()` — tracks a cleanup and returns an unregister. */
type Register = (cleanup: () => void | Promise<void>) => () => Promise<void>;

export interface BootLogicOptions {
  /**
   * Host platform impl — the fragment registering the `platform:*` capability
   * commands. `initPlatformWeb` (`@statewalker/platform.browser`) in a browser;
   * `initPlatformNode` (stub) or a future `platform-node` headless.
   */
  platform: FragmentInit;
  /**
   * Host workspace-provisioning strategy — how the `Workspace` acquires its
   * `FilesApi` and opens. `initWorkspaceBridge` (FS-Access picker + IndexedDB
   * restore) in a browser; a synchronous `setFileSystem().open()` headless.
   */
  provisionWorkspace: FragmentInit;
  logic?: readonly FragmentInit[];
  onLogicReady?: BootShellOptions["onLogicReady"];
}

export interface BootHeadlessOptions {
  /** The workspace's file system. The workspace is opened against it eagerly. */
  files: FilesApi;
  /** Host platform impl. Defaults to the in-process `initPlatformNode` stub. */
  platform?: FragmentInit;
  logic?: readonly FragmentInit[];
  onLogicReady?: BootShellOptions["onLogicReady"];
}

/**
 * Register the isomorphic logic substrate — no React, no DOM, no QueryClient.
 * Runs identically in a browser and under Node; the only host-specific choices
 * are the two injected fragments (`platform`, `provisionWorkspace`), kept at
 * their exact original ordinals so the fixed substrate order is unchanged.
 *
 * Fixed order: platform(1) → spec-store(2) → dock(3) → provisionWorkspace(4) →
 * settings(5) → workspace-files(6) → files(7) → inline-content(8) → app logic →
 * onLogicReady hook.
 */
export function bootLogic(
  ctx: Record<string, unknown>,
  register: Register,
  opts: BootLogicOptions,
): void {
  register(opts.platform(ctx)); // slot 1
  register(initSpecStore(ctx));
  register(initDock(ctx));
  register(opts.provisionWorkspace(ctx)); // slot 4
  register(initSettings(ctx));
  register(initWorkspaceFiles(ctx));
  register(initFiles(ctx));
  register(initInlineContent(ctx));

  for (const init of opts.logic ?? []) {
    register(init(ctx));
  }

  if (opts.onLogicReady) {
    const result = opts.onLogicReady(ctx, register);
    if (typeof result === "function") {
      register(result);
    }
  }
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
 * (e.g. `import "@statewalker/shell.view.react/styles"`) since CSS load order
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

  // ── 1–3. Isomorphic logic substrate + app logic + pre-renderer hook ──
  // Browser host: platform.browser + the FS-Access workspace bridge.
  bootLogic(ctx, register, {
    platform: initPlatformWeb,
    provisionWorkspace: initWorkspaceBridge,
    logic: options.logic,
    onLogicReady: options.onLogicReady,
  });

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

/**
 * Boot the isomorphic logic substrate headlessly — no React, no DOM. For Node
 * hosts and headless tests of the substrate + app logic fragments.
 *
 * The workspace is provisioned synchronously against `options.files` and opened
 * eagerly; `open()` is async, so callers that need the workspace loaded before
 * asserting should await `workspace.onLoad` (or the workspace's ready signal)
 * rather than assuming it is open on return.
 *
 * The default `platform` is the in-process `initPlatformNode` stub — durable
 * preferences only; browser-only capabilities are unregistered by design.
 */
export function bootHeadless(options: BootHeadlessOptions): BootShellResult {
  const workspace = new Workspace();
  const ctx: Record<string, unknown> = { "workspace:workspace": workspace };
  const [register, cleanup] = newRegistry();

  bootLogic(ctx, register, {
    platform: options.platform ?? initPlatformNode,
    provisionWorkspace: (c) => {
      const ws = getWorkspace(c);
      ws.setFileSystem(options.files);
      void ws.open();
      return () => ws.close();
    },
    logic: options.logic,
    onLogicReady: options.onLogicReady,
  });

  return { workspace, ctx, cleanup };
}
