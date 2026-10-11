import type { FilesApi } from "@statewalker/webrun-files";
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
