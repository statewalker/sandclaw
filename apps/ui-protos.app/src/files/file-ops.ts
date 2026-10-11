import type { FolderEntry } from "../mock.js";

// File operations over an in-memory copy of the user's folder. Each operation
// returns a new tree (the input is never changed) or an error sentence a person
// can read. Paths are "/"-joined names from the folder's root; "" is the root.

export type Result = { tree: FolderEntry[]; path: string } | { error: string };

/** The folder the assistant writes what it produces into. */
export const OUTPUTS = "Outputs";

export const nameOf = (path: string) => path.split("/").at(-1) ?? path;
export const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
export const joinPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
export const isOutput = (path: string) => path === OUTPUTS || path.startsWith(`${OUTPUTS}/`);
const inside = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);
/** The folder's display name: "" is the user's folder itself. */
const folderLabel = (folder: string) => (folder ? `“${nameOf(folder)}”` : "your folder");

export function findEntry(tree: FolderEntry[], path: string): FolderEntry | undefined {
  let entries = tree;
  let found: FolderEntry | undefined;
  for (const name of path.split("/")) {
    found = entries.find((e) => e.name === name);
    if (!found) return undefined;
    entries = found.children ?? [];
  }
  return found;
}

/** The entries of a folder ("" is the root), or undefined when it is not a folder. */
function childrenOf(tree: FolderEntry[], folder: string): FolderEntry[] | undefined {
  return folder ? findEntry(tree, folder)?.children : tree;
}

/** A copy of the tree with the children of `folder` replaced. */
function withChildren(
  tree: FolderEntry[],
  folder: string,
  update: (children: FolderEntry[]) => FolderEntry[],
): FolderEntry[] {
  if (!folder) return update(tree);
  const [head, ...rest] = folder.split("/");
  return tree.map((e) =>
    e.name === head && e.children
      ? { ...e, children: withChildren(e.children, rest.join("/"), update) }
      : e,
  );
}

const sorted = (entries: FolderEntry[]) =>
  [...entries].sort(
    (a, b) =>
      Number(!a.children) - Number(!b.children) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

export const INVALID_CHARS = /[/\\:*?"<>|]/;

/**
 * Why `name` cannot be used in `folder`, or undefined when it can. Names are
 * compared ignoring case: Windows and macOS disks treat "Notes" and "notes" as
 * the same file. `except` is the entry being renamed (it may keep its name or
 * change only its case).
 */
export function nameError(
  tree: FolderEntry[],
  folder: string,
  name: string,
  except?: string,
): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "Type a name.";
  if (INVALID_CHARS.test(trimmed)) return 'A name can’t contain / \\ : * ? " < > |';
  if (trimmed === "." || trimmed === "..") return "Choose another name.";
  const clash = childrenOf(tree, folder)?.find(
    (e) => e.name.toLowerCase() === trimmed.toLowerCase() && e.name !== except,
  );
  if (clash) return `There is already “${clash.name}” in ${folderLabel(folder)}.`;
  return undefined;
}

/** `name`, or "name (2).ext", "name (3).ext"… — the first one free in `folder`. */
export function freeName(tree: FolderEntry[], folder: string, name: string): string {
  const taken = new Set((childrenOf(tree, folder) ?? []).map((e) => e.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** A new empty note or folder in `folder`, under a free default name. */
export function create(tree: FolderEntry[], folder: string, kind: "file" | "folder"): Result {
  const name = freeName(tree, folder, kind === "folder" ? "New folder" : "Untitled.md");
  const entry: FolderEntry = kind === "folder" ? { name, children: [] } : { name, text: "" };
  return {
    tree: withChildren(tree, folder, (children) => sorted([...children, entry])),
    path: joinPath(folder, name),
  };
}

export function rename(tree: FolderEntry[], path: string, name: string): Result {
  const folder = parentOf(path);
  const error = nameError(tree, folder, name, nameOf(path));
  if (error) return { error };
  const trimmed = name.trim();
  return {
    tree: withChildren(tree, folder, (children) =>
      sorted(children.map((e) => (e.name === nameOf(path) ? { ...e, name: trimmed } : e))),
    ),
    path: joinPath(folder, trimmed),
  };
}

/** Why `path` cannot move into `folder`, or undefined when it can. */
export function moveError(tree: FolderEntry[], path: string, folder: string): string | undefined {
  if (inside(folder, path)) return "A folder can’t go inside itself.";
  if (parentOf(path) === folder) return `It is already in ${folderLabel(folder)}.`;
  if (!childrenOf(tree, folder)) return "Choose a folder.";
  return nameError(tree, folder, nameOf(path));
}

export function move(tree: FolderEntry[], path: string, folder: string): Result {
  const error = moveError(tree, path, folder);
  const entry = findEntry(tree, path);
  if (error || !entry) return { error: error ?? "Not found." };
  const without = remove(tree, path);
  return {
    tree: withChildren(without, folder, (children) => sorted([...children, entry])),
    path: joinPath(folder, entry.name),
  };
}

export function remove(tree: FolderEntry[], path: string): FolderEntry[] {
  return withChildren(tree, parentOf(path), (children) =>
    children.filter((e) => e.name !== nameOf(path)),
  );
}

/**
 * Files dropped from the computer, added to `folder`. A name already there gets
 * " (2)" before its extension: an import never replaces a file.
 */
export function importFiles(
  tree: FolderEntry[],
  folder: string,
  names: string[],
): { tree: FolderEntry[]; paths: string[]; renamed: [from: string, to: string][] } {
  const paths: string[] = [];
  const renamed: [string, string][] = [];
  for (const name of names) {
    const free = freeName(tree, folder, name);
    if (free !== name) renamed.push([name, free]);
    tree = withChildren(tree, folder, (children) => sorted([...children, { name: free }]));
    paths.push(joinPath(folder, free));
  }
  return { tree, paths, renamed };
}

/** Files under an entry, at any depth; a file counts itself. */
export function countFiles(entry: FolderEntry): number {
  return entry.children ? entry.children.reduce((n, e) => n + countFiles(e), 0) : 1;
}

/** Every folder of the tree, with its path, depth-first; the root is "". */
export function listFolders(entries: FolderEntry[], prefix = ""): string[] {
  return entries.flatMap((e) =>
    e.children
      ? [joinPath(prefix, e.name), ...listFolders(e.children, joinPath(prefix, e.name))]
      : [],
  );
}

export type Viewer = "note" | "pdf" | "spreadsheet" | "document" | "image" | "text" | "none";

const VIEWERS: Record<string, Viewer> = {
  md: "note",
  pdf: "pdf",
  xlsx: "spreadsheet",
  xls: "spreadsheet",
  csv: "spreadsheet",
  ods: "spreadsheet",
  docx: "document",
  odt: "document",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  txt: "text",
  json: "text",
};

/** Which viewer opens a file, from its extension; "none" means download it instead. */
export function viewerFor(name: string): Viewer {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? (VIEWERS[name.slice(dot + 1).toLowerCase()] ?? "none") : "none";
}

export const VIEWER_LABEL: Record<Viewer, string> = {
  note: "the note editor",
  pdf: "the PDF viewer",
  spreadsheet: "the spreadsheet viewer",
  document: "the document viewer",
  image: "the image viewer",
  text: "the text viewer",
  none: "no viewer",
};
