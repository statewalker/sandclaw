import {
  propagateFilesHandle,
  registerWebLLMUrlMapping,
  webllmCatalog,
} from "@statewalker/ai-provider-browser";
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

const WEBLLM_BASE_PATH = "/.settings/models/webllm";
const HF_PREFIX = "https://huggingface.co/";

/** Hand the workspace's directory handle to the WebLLM weight-bridge SW
 *  AND pre-register URL mappings for every entry in `webllmCatalog`.
 *
 *  Pre-registration matters: without it the URL mapping is only
 *  registered just before `engine.reload(...)`, and that postMessage
 *  is async — the very first fetch from `engine.reload` can race with
 *  the SW message processing and get served straight from the network,
 *  bypassing FilesApi entirely. Pre-registering all catalog entries at
 *  bootstrap closes that race for free.
 *
 *  Best-effort — a failure here just disables FilesApi-backed weight
 *  persistence; WebLLM still works via its Cache API. */
async function bootstrapWeightBridge(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.ready;
    await propagateFilesHandle(handle);
    // Pre-register a URL mapping for every WebLLM model in the catalog.
    for (const config of Object.values(webllmCatalog)) {
      const modelUrl = config.modelId.startsWith("http")
        ? config.modelId.endsWith("/")
          ? config.modelId
          : `${config.modelId}/`
        : `${HF_PREFIX}${config.modelId}/resolve/main/`;
      await registerWebLLMUrlMapping(
        modelUrl,
        `${WEBLLM_BASE_PATH}/${config.modelId}/`,
      );
    }
  } catch {
    /* SW unavailable — WebLLM still works via Cache API. */
  }
}

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
    void bootstrapWeightBridge(handle);
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
