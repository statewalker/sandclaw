import initPlatformWeb from "@statewalker/platform.browser";
import { queryClientAdapter } from "@statewalker/ui.view.react";
import initWorkspaceBridge from "@statewalker/workspace.browser/fragment";
import { Workspace } from "@statewalker/workspace.core";
import { QueryClient } from "@tanstack/react-query";
import {
  type AppFragmentOptions,
  type BootShellResult,
  createWorkspaceContext,
  type FragmentInit,
  legacyFragments,
  onLogicReadyFragment,
  startApp,
} from "./boot-common.js";
import { substrateLogic } from "./substrate-logic.js";
import { substrateRenderers } from "./substrate-renderers.js";
import { applyInitialTheme } from "./theme-manager.js";

export interface BootShellOptions extends AppFragmentOptions {
  /** @deprecated List the app's renderers as `fragments`. Run after the substrate renderers. */
  renderers?: readonly FragmentInit[];
  /** QueryClient default options. Defaults to `{ retry: false, refetchOnWindowFocus: false }`. */
  queryClientOptions?: ConstructorParameters<typeof QueryClient>[0];
}

/**
 * Boot the canonical workbench in a browser and return the shared
 * `Workspace`, app context and kernel.
 *
 * The kernel activates, in dependency order and otherwise in this order:
 *   1. the logic substrate (`SUBSTRATE.platform` … `SUBSTRATE.inline`);
 *   2. the deprecated `logic` inits, then `onLogicReady`;
 *   3. `fragments`, the app's own (renderers among them wait for what they require);
 *   4. the substrate renderers (`SUBSTRATE.react` mounts React first);
 *   5. the deprecated `renderers` inits.
 *
 * The caller imports the CSS bundles (e.g. `import "@statewalker/shell.view.react/styles"`)
 * since CSS load order matters for the Tailwind/shadcn cascade.
 *
 * The boot also wires a `beforeunload` handler that stops the kernel.
 */
export function bootShell(options: BootShellOptions = {}): BootShellResult {
  // Apply the persisted theme before React mounts so the first paint
  // already matches the user's choice (no light-then-dark flash).
  applyInitialTheme();

  const workspace = new Workspace();
  const ctx = createWorkspaceContext(workspace);
  queryClientAdapter.set(
    ctx,
    new QueryClient(
      options.queryClientOptions ?? {
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      },
    ),
  );

  const result = startApp(
    ctx,
    workspace,
    [
      ...substrateLogic({ platform: initPlatformWeb, provisionWorkspace: initWorkspaceBridge }),
      ...legacyFragments("logic", options.logic),
      ...onLogicReadyFragment(options.onLogicReady),
      ...(options.fragments ?? []),
      ...substrateRenderers(),
      ...legacyFragments("renderer", options.renderers),
    ],
    options,
  );

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      void result.cleanup();
    });
  }
  return result;
}
