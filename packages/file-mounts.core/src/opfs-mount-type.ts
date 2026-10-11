import { BrowserFilesApi } from "@statewalker/webrun-files-browser";
import type { MountType } from "./mount-type.js";

/** Browser storage (OPFS): each mount is the folder `mounts/<key>` of the page's private storage. */
export function opfsMountType(): MountType {
  return {
    id: "opfs",
    label: "Browser storage",
    fields: [],
    isAvailable: () =>
      typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function"
        ? { ok: true }
        : { ok: false, reason: "This browser has no storage for web pages." },
    async create(mount) {
      const root = await navigator.storage.getDirectory();
      const mounts = await root.getDirectoryHandle("mounts", { create: true });
      const rootHandle = await mounts.getDirectoryHandle(mount.key, { create: true });
      return new BrowserFilesApi({ rootHandle });
    },
  };
}
