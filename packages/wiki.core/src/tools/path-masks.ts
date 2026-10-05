/**
 * Path masks for the wiki chat tools. A mask is `<project-glob>/<relpath-glob>`
 * (for example, the project glob `*` with inner glob `docs`): the segment before
 * the first `/` selects bound wikis by name, the remainder filters resources within
 * each. A mask with no `/` matches project names only (all paths). An empty/omitted
 * mask list targets every wiki, all paths.
 *
 * A leading `/` is optional and ignored, so it anchors the first segment to a project
 * name: `/docs` (or `/docs/`) is the whole `docs` project, `/docs/*` its first level,
 * `/docs/**` all levels. A `*`-prefixed mask instead spans every project's `docs/`
 * subtree at any depth (the project glob is `*`, the inner glob `docs/` + `**`).
 */

/** A bound wiki and its known resource set (project-relative uris). */
export interface WikiResources {
  name: string;
  resources: string[];
}

/**
 * A resolved target: a wiki and the path prefixes retrieval is scoped to. An empty
 * `paths` array means "no path restriction" (the whole wiki).
 */
export interface MaskTarget {
  project: string;
  paths: string[];
}

/** Anchored full-match glob → RegExp. `**` = any (incl. `/`), `*` = one segment, `?` = one non-slash char. */
function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i++;
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if (c && "\\^$.|+()[]{}".includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

/** Per-wiki accumulation while resolving masks. */
interface Acc {
  whole: boolean;
  paths: Set<string>;
}

/**
 * Resolve masks against the bound wikis. Returns one target per matched wiki:
 * whole-wiki targets carry `paths: []`; restricted targets carry the union of
 * matched resource uris. A wiki matched only by relpath masks that expand to
 * nothing is omitted (it has nothing in scope).
 */
export function resolveWikiMasks(
  masks: string[] | undefined,
  wikis: WikiResources[],
): MaskTarget[] {
  const clean = (masks ?? []).map((m) => m.trim().replace(/^\/+/, "")).filter((m) => m.length > 0);
  if (clean.length === 0) return wikis.map((w) => ({ project: w.name, paths: [] }));

  const acc = new Map<string, Acc>();
  const touch = (name: string): Acc => {
    const a = acc.get(name) ?? { whole: false, paths: new Set<string>() };
    acc.set(name, a);
    return a;
  };

  for (const mask of clean) {
    const slash = mask.indexOf("/");
    const projectGlob = slash === -1 ? mask : mask.slice(0, slash);
    const relGlob = slash === -1 ? undefined : mask.slice(slash + 1);
    const projectRe = globToRegExp(projectGlob);
    for (const w of wikis) {
      if (!projectRe.test(w.name)) continue;
      const a = touch(w.name);
      if (relGlob === undefined || relGlob === "") {
        a.whole = true;
      } else {
        const relRe = globToRegExp(relGlob);
        for (const r of w.resources) if (relRe.test(r)) a.paths.add(r);
      }
    }
  }

  const targets: MaskTarget[] = [];
  for (const [name, a] of acc) {
    if (a.whole) targets.push({ project: name, paths: [] });
    else if (a.paths.size > 0) targets.push({ project: name, paths: [...a.paths] });
    // else: matched a relpath mask but no resource matched → nothing in scope, omit.
  }
  return targets;
}
