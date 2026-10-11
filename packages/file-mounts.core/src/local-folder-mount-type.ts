import { BrowserFilesApi } from "@statewalker/webrun-files-browser";
import type { KeyValueStore } from "./key-value-store.js";
import { type MountType, NeedsUserGesture } from "./mount-type.js";
import { MountUnavailable } from "./problem.js";

// Permission calls are not in TypeScript's DOM types yet.
interface PermissionHandle {
  name: string;
  queryPermission(opts: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(opts: { mode: "readwrite" }): Promise<PermissionState>;
}
type DirectoryPicker = (opts: { mode: "readwrite" }) => Promise<FileSystemDirectoryHandle>;
const picker = () => (globalThis as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;

/**
 * A folder of the computer (File System Access API, Chromium only). The handle
 * is kept in `handles` under `config.handleId`; after a reload only a click
 * may ask for access again.
 */
export function localFolderMountType(
  handles: KeyValueStore<FileSystemDirectoryHandle>,
): MountType & { pick(): Promise<Record<string, string> | undefined> } {
  return {
    id: "local-folder",
    label: "Local folder",
    fields: [],
    prompts: true,
    isAvailable: () =>
      picker()
        ? { ok: true }
        : { ok: false, reason: "This browser can't open local folders; use Chrome or Edge." },

    /** Asks the person for a folder; the config to save, or undefined when they cancel. */
    async pick() {
      const show = picker();
      if (!show) return undefined;
      let handle: FileSystemDirectoryHandle;
      try {
        handle = await show({ mode: "readwrite" });
      } catch {
        return undefined;
      }
      const handleId = crypto.randomUUID();
      await handles.set(handleId, handle);
      return { directory: handle.name, handleId };
    },

    async create(mount, ctx) {
      const handle = await handles.get(mount.config.handleId ?? "");
      if (!handle) {
        throw new MountUnavailable(mount.key, {
          cause: "invalid-settings",
          message: "This folder was forgotten; choose it again.",
        });
      }
      const access = handle as unknown as PermissionHandle;
      let permission = await access.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        if (!ctx.interactive) throw new NeedsUserGesture();
        permission = await access.requestPermission({ mode: "readwrite" });
      }
      if (permission !== "granted") {
        throw new MountUnavailable(mount.key, {
          cause: "needs-access",
          message: `Access to ${handle.name} was refused.`,
        });
      }
      return new BrowserFilesApi({ rootHandle: handle });
    },

    async forget(mount) {
      await handles.delete(mount.config.handleId ?? "");
    },
  };
}
