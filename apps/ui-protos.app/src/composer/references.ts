import { type FolderEntry, folder } from "../mock.js";

// A document from the user's folder is sent as a reference (its path), never its
// bytes: the assistant runs in the browser and reads it with its file tool. The
// references travel in the message body as a structured prefix the assistant is
// told to read; the thread shows them as chips again.

export interface Reference {
  kind: "file" | "folder";
  /** Path in the user's folder; a folder's has no trailing slash. */
  path: string;
  /** Files under a folder, at any depth. */
  files?: number;
}

export const nameOf = (path: string) => path.split("/").at(-1) ?? path;
export const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
/** "Dupont — offer.docx", "Clients/". */
export const chipLabel = (ref: Reference) =>
  ref.kind === "folder" ? `${nameOf(ref.path)}/` : nameOf(ref.path);

const countFiles = (entries: FolderEntry[]): number =>
  entries.reduce((n, e) => n + (e.children ? countFiles(e.children) : 1), 0);

/** Every file and folder of the user's folder, folders first at each level. */
export function folderReferences(entries: FolderEntry[] = folder, prefix = ""): Reference[] {
  return entries.flatMap((e) => {
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    return e.children
      ? [
          { kind: "folder" as const, path, files: countFiles(e.children) },
          ...folderReferences(e.children, path),
        ]
      : [{ kind: "file" as const, path }];
  });
}

/** Files and folders whose name contains `query`, case-insensitive. */
export function matchReferences(query: string, limit = 6): Reference[] {
  const q = query.trim().toLowerCase();
  return folderReferences()
    .filter((r) => nameOf(r.path).toLowerCase().includes(q))
    .slice(0, limit);
}

export const findReference = (path: string) => folderReferences().find((r) => r.path === path);

const OPEN = "<context>";
const CLOSE = "</context>";

/** The message body: the referenced paths first, then what the user wrote. */
export function encodeBody(text: string, refs: Reference[]): string {
  if (refs.length === 0) return text;
  const lines = refs.map((r) => `<${r.kind} path="${r.path}"/>`);
  return [OPEN, ...lines, CLOSE, text].join("\n");
}

/** The inverse of `encodeBody`. Unknown paths still show, as files. */
export function decodeBody(body: string): { refs: Reference[]; text: string } {
  if (!body.startsWith(`${OPEN}\n`)) return { refs: [], text: body };
  const end = body.indexOf(`${CLOSE}`);
  if (end < 0) return { refs: [], text: body };
  const refs = [...body.slice(0, end).matchAll(/<(file|folder) path="([^"]*)"\/>/g)].map(
    ([, kind = "file", path = ""]) =>
      findReference(path) ?? { kind: kind as Reference["kind"], path },
  );
  return { refs, text: body.slice(end + CLOSE.length).replace(/^\n/, "") };
}
