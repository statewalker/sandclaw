// The App's one world: the user's folder as the Indexing view shows it (mock.ts's
// folder plus its bulk), as real files in the demo storage's Documents mount, so
// every view's paths open in the commander.
import { newDemoStorages } from "../file-panels/demo-storages.js";
import { atelierFolder } from "../indexing/reading.js";
import type { FolderEntry } from "../mock.js";

/** Where the user's folder is mounted (file-panels' `ViewerBody` matches it as "/documents/"). */
export const FOLDER_MOUNT = "/documents";

/** A path as the views name it ("Notes/todo.md") → its path in the storage. */
export const worldPath = (path: string) => `${FOLDER_MOUNT}/${path}`;

/** Stand-in content for files whose text the prototypes don't need. */
const placeholder = (n: number) => new Uint8Array(n).fill(65);

/** The folder's files by path; folders become paths, files without text get small stand-in bytes. */
export function folderSeed(
  entries: FolderEntry[],
  prefix = "",
): Record<string, string | Uint8Array> {
  const seed: Record<string, string | Uint8Array> = {};
  for (const entry of entries) {
    const path = `${prefix}/${entry.name}`;
    if (entry.children) Object.assign(seed, folderSeed(entry.children, path));
    else seed[path] = entry.text ?? placeholder(2_000);
  }
  return seed;
}

/** The demo storages with the user's folder in Documents, plus the deck the assistant writes. */
export function newAppStorages() {
  return newDemoStorages({
    seed: {
      documents: { ...folderSeed(atelierFolder), "/Outputs/clients.pptx": placeholder(180_000) },
    },
  });
}
