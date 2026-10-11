import type { FileInfo } from "@statewalker/webrun-files";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

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
