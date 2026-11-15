import { joinPath, tryReadText } from "@statewalker/webrun-files";
import { makeProjectIgnore, type Project } from "@statewalker/workspace.core";
import { buildIndexIgnore } from "../runtime/index-ignore.js";

const DEFAULT_SYSTEM_FOLDER = ".project";

/**
 * A predicate telling whether a document's source is gone: its file no longer exists, or the
 * scan would skip it (a dot-segment, `.projectignore`, `.indexignore`). A builder without
 * state (after an upgrade, or `restartFrom`) uses it to tell a document that was removed
 * from one the scan has not reached yet — the scan feeds sources in batches, so "not in the
 * input yet" does not mean "gone".
 */
export async function staleSourcePredicate(
  project: Project,
): Promise<(uri: string) => Promise<boolean>> {
  const files = project.workspace.files;
  const root = project.path;
  const projectIgnore = makeProjectIgnore(
    await tryReadText(files, joinPath(root, ".projectignore")),
  );
  const indexIgnore = await buildIndexIgnore(files, root);
  return async (uri) =>
    uri.split("/").some((seg) => seg.startsWith(".")) ||
    projectIgnore(uri) ||
    indexIgnore(uri) ||
    !(await files.stats(joinPath(root, uri)));
}

/** The documents that have a per-page artifact folder (`.project/pages/<uri>/raw.meta.json`). */
export async function pagesWithArtifacts(project: Project): Promise<string[]> {
  const pagesRoot = joinPath(project.path, DEFAULT_SYSTEM_FOLDER, "pages").replace(/^\/+/, "");
  const uris: string[] = [];
  for await (const info of project.workspace.files.list(pagesRoot, { recursive: true })) {
    if (info.kind !== "file") continue;
    const p = info.path.replace(/^\/+/, "");
    if (!p.startsWith(`${pagesRoot}/`) || !p.endsWith("/raw.meta.json")) continue;
    uris.push(p.slice(pagesRoot.length + 1, -"/raw.meta.json".length));
  }
  return uris;
}
