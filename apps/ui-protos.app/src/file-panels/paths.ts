import type { FileInfo, FilesApi } from "@statewalker/webrun-files";
import { dirname } from "@statewalker/webrun-files";

export interface Crumb {
  name: string;
  path: string;
  isMount: boolean;
}

export function breadcrumb(path: string, mountNames: Record<string, string>): Crumb[] {
  const parts = path.split("/").filter(Boolean);
  return parts.map((part, i) => ({
    name: i === 0 ? (mountNames[part] ?? part) : part,
    path: `/${parts.slice(0, i + 1).join("/")}`,
    isMount: i === 0,
  }));
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** The folders beside a crumb: the ▾ menu. Beside a mount are the other mounts. */
export async function siblings(
  files: FilesApi,
  crumb: Crumb,
): Promise<{ name: string; path: string }[]> {
  const out: { name: string; path: string }[] = [];
  for await (const e of files.list(dirname(crumb.path))) {
    if (e.kind === "directory") out.push({ name: e.name, path: e.path });
  }
  return out.sort((a, b) => collator.compare(a.name, b.name));
}

export type SortField = "name" | "size" | "lastModified";
export interface Sort {
  field: SortField;
  descending: boolean;
}

export function sortEntries(entries: FileInfo[], sort: Sort): FileInfo[] {
  const value = (e: FileInfo) =>
    e.kind === "file" ? (sort.field === "size" ? e.size : e.lastModified) : 0;
  const byField = (a: FileInfo, b: FileInfo) =>
    sort.field === "name"
      ? collator.compare(a.name, b.name)
      : value(a) - value(b) || collator.compare(a.name, b.name);
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return sort.descending ? byField(b, a) : byField(a, b);
  });
}

export function clickSelect(
  selected: string[],
  anchor: string | undefined,
  order: string[],
  path: string,
  mods: { shift: boolean; ctrl: boolean },
): { selected: string[]; anchor: string } {
  if (mods.shift && anchor) {
    const i = order.indexOf(anchor);
    const j = order.indexOf(path);
    return { selected: order.slice(Math.min(i, j), Math.max(i, j) + 1), anchor };
  }
  if (mods.ctrl) {
    const next = selected.includes(path) ? selected.filter((p) => p !== path) : [...selected, path];
    return { selected: order.filter((p) => next.includes(p)), anchor: path };
  }
  return { selected: [path], anchor: path };
}
