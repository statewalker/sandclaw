// WebLLM-related imports disabled. The bootstrap weight-bridge now
// only pre-registers transformers.js URL mappings — WebLLM catalog and
// SW handle propagation are re-enabled together with WebLLM in
// @statewalker/ai-provider-browser.
// import { createDefaultCatalog } from "@statewalker/ai-agent/models";
// import {
//   propagateFilesHandle,
//   registerWebLLMUrlMapping,
//   webllmCatalog,
// } from "@statewalker/ai-provider-browser";
import { Intents } from "@statewalker/shared-intents";
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
import { runChangeWorkspace } from "@/fragments/workspace-bridge";
import { useAppWorkspace } from "@/fragments/workspace-bridge-views";
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

// WebLLM weight-bridge bootstrap disabled — depends on the SW that
// is no longer registered in main.tsx and on @statewalker/ai-provider-browser
// exports that are currently commented out. Restore alongside WebLLM.
// const WEBLLM_BASE_PATH = "/.settings/models/webllm";
// const TJS_BASE_PATH = "/.settings/models/tjs";
// const HF_PREFIX = "https://huggingface.co/";
//
// async function bootstrapWeightBridge(
//   handle: FileSystemDirectoryHandle,
// ): Promise<void> {
//   if (!("serviceWorker" in navigator)) return;
//   try {
//     await navigator.serviceWorker.ready;
//     await propagateFilesHandle(handle);
//     for (const config of Object.values(webllmCatalog)) {
//       const modelUrl = config.modelId.startsWith("http")
//         ? config.modelId.endsWith("/")
//           ? config.modelId
//           : `${config.modelId}/`
//         : `${HF_PREFIX}${config.modelId}/resolve/main/`;
//       await registerWebLLMUrlMapping(
//         modelUrl,
//         `${WEBLLM_BASE_PATH}/${config.modelId}/`,
//       );
//     }
//     for (const config of Object.values(createDefaultCatalog())) {
//       if (config.runtime !== "local" || config.engine !== "tjs") continue;
//       const modelUrl = `${HF_PREFIX}${config.modelId}/resolve/main/`;
//       await registerWebLLMUrlMapping(
//         modelUrl,
//         `${TJS_BASE_PATH}/${config.modelId}/`,
//       );
//     }
//   } catch {
//     /* SW unavailable — WebLLM still works via Cache API. */
//   }
// }

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
  const workspace = useAppWorkspace();
  const intents = workspace.requireAdapter(Intents);

  const adoptHandle = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      const filesApi = createBrowserFilesApi(handle);
      // Drive the canonical Workspace lifecycle (ADR 0001) — the
      // change-workspace handler in `workspace-bridge` performs
      // close → setFileSystem (+ SystemFiles/Secrets/Settings) →
      // open. After this resolves, `workspace.onLoad` listeners
      // have fired and FilesApi-dependent fragments are ready.
      await runChangeWorkspace(intents, { files: filesApi, label: handle.name })
        .promise;
      setState({ status: "ready", handle, filesApi, label: handle.name });
      // void bootstrapWeightBridge(handle); // disabled with WebLLM
    },
    [intents],
  );

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
        await adoptHandle(handle);
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
    await adoptHandle(handle);
  }, [adoptHandle]);

  const reconnect = useCallback(async () => {
    if (state.status !== "needs-permission") return;
    const result = await requestHandlePermission(state.handle);
    if (result === "granted") {
      await adoptHandle(state.handle);
    } else {
      await clearStoredHandle();
      setState({ status: "empty" });
    }
  }, [state, adoptHandle]);

  const switchWorkspace = useCallback(async () => {
    await clearStoredHandle();
    // Tear down the current workspace lifecycle so onUnload
    // listeners fire (ADR 0001). The `runChangeWorkspace`
    // path will rebind on the next pick.
    await workspace.close();
    setState({ status: "empty" });
  }, [workspace]);

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
