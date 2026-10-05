import { type FilesApi, tryReadText } from "@statewalker/webrun-files";
import { compileIgnoreRules, type IgnoreRule } from "@statewalker/workspace.core";

/** The wiki source-exclusion file name (one per directory subtree). */
const IGNORE_FILE = ".indexignore";

/**
 * Directories always kept out of the index, regardless of `.indexignore`: the
 * system folder and the generated mini-site / table-of-contents output (so Phase-3
 * generated markdown never feeds back into the index). A negation cannot re-include
 * these.
 */
const IMPLICIT_IGNORED = [".project", "tocs", "sites"];

/** Component-boundary "under any of these dir prefixes" test. */
function underAny(uri: string, dirs: string[]): boolean {
  return dirs.some((d) => uri === d || uri.startsWith(`${d}/`));
}

/** Ancestor-or-self path prefixes of a uri: `a/b/c` → [`a`, `a/b`, `a/b/c`]. */
function selfAndAncestors(uri: string): string[] {
  const segments = uri.split("/");
  const out: string[] = [];
  for (let i = 1; i <= segments.length; i++) out.push(segments.slice(0, i).join("/"));
  return out;
}

/** One `.indexignore` file: its directory (project-relative), depth, and compiled rules. */
interface NestedIgnore {
  dir: string;
  depth: number;
  rules: IgnoreRule[];
}

/**
 * Compile the wiki's `.indexignore` matcher over a project's source tree. Every
 * `.indexignore` file (root and nested) governs its own subtree with gitignore
 * semantics — globs, negation, last-match-wins within a file; a deeper file
 * overrides a shallower one. The implicit defaults (`.project/`, `tocs/`, `sites/`)
 * are always excluded and cannot be re-included by a negation. Uris are
 * project-relative; the result is the predicate injected via
 * `ProjectBuilder.configureSourceIgnore`, recompiled per scan so edits take effect
 * on the next run.
 */
export async function buildIndexIgnore(
  filesApi: FilesApi,
  projectPath: string,
): Promise<(uri: string) => boolean> {
  const base = projectPath.replace(/^\/+|\/+$/g, "");
  const toUri = (fsPath: string): string | undefined => {
    const p = fsPath.replace(/^\/+/, "");
    if (base === "") return p;
    if (!p.startsWith(`${base}/`)) return undefined;
    return p.slice(base.length + 1);
  };

  const files: NestedIgnore[] = [];
  for await (const info of filesApi.list(projectPath, { recursive: true })) {
    if (info.kind !== "file") continue;
    const uri = toUri(info.path);
    if (uri === undefined) continue;
    if (uri.split("/").pop() !== IGNORE_FILE) continue;
    const dir = uri.slice(0, Math.max(0, uri.length - IGNORE_FILE.length)).replace(/\/+$/, "");
    // An ignore file inside an always-excluded dir governs nothing indexable.
    if (underAny(uri, IMPLICIT_IGNORED)) continue;
    const text = await tryReadText(filesApi, info.path);
    files.push({
      dir,
      depth: dir === "" ? 0 : dir.split("/").length,
      rules: compileIgnoreRules(text ?? ""),
    });
  }
  files.sort((a, b) => a.depth - b.depth);

  return (uri: string) => {
    if (underAny(uri, IMPLICIT_IGNORED)) return true;
    let ignored = false;
    for (const f of files) {
      if (!(f.dir === "" || uri === f.dir || uri.startsWith(`${f.dir}/`))) continue;
      const rel = f.dir === "" ? uri : uri.slice(f.dir.length + 1);
      const candidates = selfAndAncestors(rel);
      for (const rule of f.rules) {
        if (candidates.some((c) => rule.regex.test(c))) ignored = !rule.negate;
      }
    }
    return ignored;
  };
}
