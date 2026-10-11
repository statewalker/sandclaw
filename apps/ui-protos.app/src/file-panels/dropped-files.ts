// Files and folders dropped from the desktop, read into memory so the same
// planner and runner copy them like any other source.
import type { FilesApi } from "@statewalker/webrun-files";
import { joinPath } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";

// The parts of FileSystemEntry this reads; a test passes plain objects.
interface Entry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?(ok: (file: File) => void, fail?: (error: unknown) => void): void;
  createReader?(): {
    readEntries(ok: (entries: Entry[]) => void, fail?: (e: unknown) => void): void;
  };
}

const ROOT = "/drop";

/**
 * Reads a drop into a `MemFilesApi` under `/drop/…`; `paths` are the dropped
 * items themselves. Folders are read through `webkitGetAsEntry` when the
 * browser offers it, otherwise only the plain `files` are taken.
 */
export async function readDropped(
  data: DataTransfer,
): Promise<{ files: FilesApi; paths: string[] }> {
  // Entries must be taken before the first await: the browser empties the
  // DataTransfer once the drop event handler returns.
  const entries = Array.from(data.items ?? [])
    .map((item) => item.webkitGetAsEntry?.() as Entry | null | undefined)
    .filter((e): e is Entry => Boolean(e));
  const plain = Array.from(data.files ?? []);
  const files = new MemFilesApi();
  const write = async (path: string, file: File) =>
    files.write(path, [new Uint8Array(await file.arrayBuffer())]);

  if (!entries.length) {
    for (const file of plain) await write(joinPath(ROOT, file.name), file);
    return { files, paths: plain.map((f) => joinPath(ROOT, f.name)) };
  }

  const walk = async (entry: Entry): Promise<void> => {
    const path = joinPath(ROOT, entry.fullPath);
    if (entry.isFile && entry.file) {
      const file = await new Promise<File>((ok, fail) => entry.file?.(ok, fail));
      await write(path, file);
    } else if (entry.isDirectory && entry.createReader) {
      await files.mkdir(path);
      const reader = entry.createReader();
      // readEntries returns a batch at a time, and an empty batch at the end.
      for (;;) {
        const batch = await new Promise<Entry[]>((ok, fail) => reader.readEntries(ok, fail));
        if (!batch.length) break;
        for (const child of batch) await walk(child);
      }
    }
  };
  for (const entry of entries) await walk(entry);
  return { files, paths: entries.map((e) => joinPath(ROOT, e.fullPath)) };
}
