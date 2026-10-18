import initPlatformNode from "@statewalker/platform.node";
import type { FilesApi } from "@statewalker/webrun-files";
import { getWorkspace, Workspace } from "@statewalker/workspace.core";
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

export interface BootHeadlessOptions extends AppFragmentOptions {
  /** The workspace's file system. The workspace is opened against it eagerly. */
  files: FilesApi;
  /**
   * Host platform impl. Defaults to `@statewalker/platform.node`'s
   * `initPlatformNode`: filesystem-backed preferences at the host config dir.
   */
  platform?: FragmentInit;
}

/**
 * Boot the isomorphic logic substrate headlessly: no React, no DOM. For Node
 * hosts and headless tests of the substrate and app logic fragments.
 *
 * The workspace is provisioned against `options.files` and opened eagerly;
 * `open()` is async, so callers that need the workspace loaded should await
 * `workspace.onLoad` (or `ready`) rather than assume it is open on return.
 *
 * The default `platform` is `@statewalker/platform.node`'s `initPlatformNode`;
 * tests inject an in-memory one to avoid touching the real config dir.
 */
export function bootHeadless(options: BootHeadlessOptions): BootShellResult {
  const workspace = new Workspace();
  const ctx = createWorkspaceContext(workspace);
  return startApp(
    ctx,
    workspace,
    [
      ...substrateLogic({
        platform: options.platform ?? initPlatformNode,
        provisionWorkspace: (c) => {
          const ws = getWorkspace(c);
          ws.setFileSystem(options.files);
          void ws.open();
          return () => ws.close();
        },
      }),
      ...legacyFragments("logic", options.logic),
      ...onLogicReadyFragment(options.onLogicReady),
      ...(options.fragments ?? []),
    ],
    options,
  );
}
