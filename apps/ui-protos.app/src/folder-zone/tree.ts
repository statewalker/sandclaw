import type { FolderEntry } from "../mock.js";

export interface FileRef {
  path: string;
  entry: FolderEntry;
}

/** Every file (not folder) under `entries`, with its path. */
export function listFiles(entries: FolderEntry[], prefix = ""): FileRef[] {
  return entries.flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.children ? listFiles(entry.children, path) : [{ path, entry }];
  });
}

/**
 * The tree reduced to entries whose name contains `query` (case-insensitive),
 * with the folders that lead to them. An empty query keeps everything.
 */
export function filterTree(entries: FolderEntry[], query: string): FolderEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.flatMap((entry) => {
    if (entry.name.toLowerCase().includes(q)) return [entry];
    if (!entry.children) return [];
    const children = filterTree(entry.children, q);
    return children.length ? [{ ...entry, children }] : [];
  });
}
