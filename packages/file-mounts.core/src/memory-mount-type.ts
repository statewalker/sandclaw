import type { FilesApi } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import type { MountType } from "./mount-type.js";

/** In-memory storages for tests and demos; a key keeps its files when re-created. */
export function memoryMountType(): MountType {
  const stores = new Map<string, FilesApi>();
  return {
    id: "memory",
    label: "Memory",
    fields: [],
    isAvailable: () => ({ ok: true }),
    async create(mount) {
      let files = stores.get(mount.key);
      if (!files) {
        files = new MemFilesApi();
        stores.set(mount.key, files);
      }
      return files;
    },
  };
}
