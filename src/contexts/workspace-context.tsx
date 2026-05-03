import type { FilesApi } from "@statewalker/webrun-files";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createBrowserFilesApi,
  isFileSystemAccessSupported,
  pickDirectory,
  queryHandlePermission,
  requestHandlePermission,
} from "@/services/files-api-factory";
import {
  clearStoredHandle,
  getStoredHandle,
  setStoredHandle,
} from "@/services/handle-store";

export type WorkspaceState =
  | { status: "loading" }
  | { status: "unsupported"; reason: string }
  | { status: "empty" } // no handle, ready to pick
  | {
      status: "needs-permission";
      handle: FileSystemDirectoryHandle;
      label: string;
    } // stored but permission==prompt
  | {
      status: "ready";
      handle: FileSystemDirectoryHandle;
      filesApi: FilesApi;
      label: string;
    };

interface WorkspaceContextValue {
  state: WorkspaceState;
  pick: () => Promise<void>;
  reconnect: () => Promise<void>;
  switchWorkspace: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [state, setState] = useState<WorkspaceState>({ status: "loading" });

  const adoptHandle = useCallback((handle: FileSystemDirectoryHandle) => {
    const filesApi = createBrowserFilesApi(handle);
    setState({ status: "ready", handle, filesApi, label: handle.name });
  }, []);

  // Initial mount: try to silently restore a stored handle.
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isFileSystemAccessSupported()) {
        if (!mounted) return;
        setState({
          status: "unsupported",
          reason:
            "This browser does not support the File System Access API (Chromium-only at the moment).",
        });
        return;
      }
      const handle = await getStoredHandle();
      if (!mounted) return;
      if (!handle) {
        setState({ status: "empty" });
        return;
      }
      const perm = await queryHandlePermission(handle);
      if (!mounted) return;
      if (perm === "granted") {
        adoptHandle(handle);
      } else if (perm === "prompt") {
        setState({ status: "needs-permission", handle, label: handle.name });
      } else {
        await clearStoredHandle();
        setState({ status: "empty" });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [adoptHandle]);

  const pick = useCallback(async () => {
    const handle = await pickDirectory();
    await setStoredHandle(handle);
    adoptHandle(handle);
  }, [adoptHandle]);

  const reconnect = useCallback(async () => {
    if (state.status !== "needs-permission") return;
    const result = await requestHandlePermission(state.handle);
    if (result === "granted") {
      adoptHandle(state.handle);
    } else {
      await clearStoredHandle();
      setState({ status: "empty" });
    }
  }, [state, adoptHandle]);

  const switchWorkspace = useCallback(async () => {
    await clearStoredHandle();
    setState({ status: "empty" });
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ state, pick, reconnect, switchWorkspace }),
    [state, pick, reconnect, switchWorkspace],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>.");
  }
  return ctx;
}
