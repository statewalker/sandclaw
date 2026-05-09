import { Intents } from "@statewalker/shared-intents";
import { newRegistry } from "@statewalker/shared-registry";
import type { FilesApi } from "@statewalker/webrun-files";
import {
  handleChangeWorkspace,
  initWorkspace,
  type Workspace,
} from "@statewalker/workspace-api";
import {
  handleWorkspaceDisconnect,
  handleWorkspaceReconnect,
} from "../public/intents.js";
import {
  createBrowserFilesApi,
  isFileSystemAccessSupported,
  pickDirectory,
  queryHandlePermission,
  requestHandlePermission,
} from "./files-api-factory.js";
import {
  clearStoredHandle,
  getStoredHandle,
  setStoredHandle,
} from "./handle-store.js";
import { WorkspaceShellAdapter } from "./workspace-shell-adapter.js";

export interface WorkspaceBridgeManagerOptions {
  workspace: Workspace;
}

/**
 * Orchestrator for the workspace-bridge fragment. Owns:
 *   - the `WorkspaceShellAdapter` (single source of truth for the
 *     FS-Access shell state machine, per ADR 0004),
 *   - the `workspace:change` handler (interactive path picks the
 *     directory itself so the manager captures the
 *     `FileSystemDirectoryHandle` for IndexedDB persistence — the
 *     canonical handler in `workspace-api` delegates to
 *     `platform:pick-directory`, which only returns
 *     `{files, label}` and loses the handle),
 *   - the `workspace:reconnect` and `workspace:disconnect` handlers,
 *   - a `workspace.onLoad` subscription that transitions the shell
 *     adapter to `ready` whenever the workspace opens (covers both
 *     silent-restore and interactive picks with a single path).
 *
 * Silent-restore runs from the constructor (not gated on `onLoad`,
 * per ADR 0004) — the adapter starts in `loading`, then transitions
 * based on whether IndexedDB has a stored handle and what
 * `queryPermission` returns.
 */
export class WorkspaceBridgeManager {
  private readonly _workspace: Workspace;
  private readonly _intents: Intents;
  private readonly _shell: WorkspaceShellAdapter;
  private readonly _cleanup: () => Promise<void>;
  private _currentHandle: FileSystemDirectoryHandle | null = null;

  constructor({ workspace }: WorkspaceBridgeManagerOptions) {
    this._workspace = workspace;
    this._intents = workspace.requireAdapter(Intents);
    this._shell = workspace.requireAdapter(WorkspaceShellAdapter);

    const [register, cleanup] = newRegistry();
    this._cleanup = cleanup;

    // Whenever the workspace opens (silent-restore, interactive pick,
    // or a non-interactive `runChangeWorkspace({ files })` call from
    // a test / integration harness), reflect that as "ready" in the
    // shell adapter.
    register(
      workspace.onLoad(() => {
        this._shell._setState({
          status: "ready",
          label: workspace.label,
        });
      }),
    );

    register(
      handleChangeWorkspace(this._intents, (intent) => {
        void this._handleChangeWorkspace(intent.payload)
          .then((result) => intent.resolve(result))
          .catch((error) => intent.reject(error));
        return true;
      }),
    );

    register(
      handleWorkspaceReconnect(this._intents, (intent) => {
        void this._reconnect()
          .then(() => intent.resolve({}))
          .catch((error) => intent.reject(error));
        return true;
      }),
    );

    register(
      handleWorkspaceDisconnect(this._intents, (intent) => {
        void this._disconnect()
          .then(() => intent.resolve({}))
          .catch((error) => intent.reject(error));
        return true;
      }),
    );

    void this._silentRestore();
  }

  async close(): Promise<void> {
    await this._cleanup();
  }

  private async _handleChangeWorkspace(payload: {
    files?: FilesApi;
    label?: string;
  }): Promise<{ workspace: Workspace }> {
    let files: FilesApi;
    let label: string;
    let pickedHandle: FileSystemDirectoryHandle | undefined;

    if (payload.files) {
      // Non-interactive path: silent-restore, reconnect, tests.
      files = payload.files;
      label = payload.label ?? "Workspace";
    } else {
      // Interactive path: pick the folder ourselves so we capture
      // the handle for IndexedDB persistence. Bypasses
      // `platform:pick-directory` (which only returns `{files,label}`).
      pickedHandle = await pickDirectory();
      await setStoredHandle(pickedHandle);
      files = createBrowserFilesApi(pickedHandle);
      label = pickedHandle.name;
    }

    await this._workspace.close();
    initWorkspace({ workspace: this._workspace, filesApi: files, label });
    await this._workspace.open();

    if (pickedHandle) {
      this._currentHandle = pickedHandle;
    }
    return { workspace: this._workspace };
  }

  private async _silentRestore(): Promise<void> {
    if (!isFileSystemAccessSupported()) {
      this._shell._setState({
        status: "unsupported",
        reason:
          "This browser does not support the File System Access API (Chromium-only at the moment).",
      });
      return;
    }
    const handle = await getStoredHandle();
    if (!handle) {
      this._shell._setState({ status: "empty" });
      return;
    }
    const perm = await queryHandlePermission(handle);
    if (perm === "granted") {
      await this._adoptStoredHandle(handle);
    } else if (perm === "prompt") {
      this._currentHandle = handle;
      this._shell._setState({
        status: "needs-permission",
        label: handle.name,
      });
    } else {
      await clearStoredHandle();
      this._shell._setState({ status: "empty" });
    }
  }

  private async _adoptStoredHandle(
    handle: FileSystemDirectoryHandle,
  ): Promise<void> {
    this._currentHandle = handle;
    const filesApi = createBrowserFilesApi(handle);
    // Drive workspace lifecycle directly. The `onLoad` listener
    // registered in the constructor will set the shell adapter to
    // `ready` once `workspace.open()` resolves.
    await this._workspace.close();
    initWorkspace({
      workspace: this._workspace,
      filesApi,
      label: handle.name,
    });
    await this._workspace.open();
  }

  private async _reconnect(): Promise<void> {
    const handle = this._currentHandle;
    if (!handle) {
      this._shell._setState({ status: "empty" });
      return;
    }
    const result = await requestHandlePermission(handle);
    if (result === "granted") {
      await setStoredHandle(handle);
      await this._adoptStoredHandle(handle);
    } else {
      await clearStoredHandle();
      this._currentHandle = null;
      this._shell._setState({ status: "empty" });
    }
  }

  private async _disconnect(): Promise<void> {
    await this._workspace.close();
    await clearStoredHandle();
    this._currentHandle = null;
    this._shell._setState({ status: "empty" });
  }
}
