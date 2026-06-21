import type { Project, Workspace } from "@statewalker/workspace.core";
import { wikiConfigOf } from "../llm/index.js";
import { wikiNatureOf } from "../runtime/wiki-nature.js";
import { SearchAdapter } from "../search/index.js";
import { resolveWikiMasks, type WikiResources } from "./path-masks.js";

/** Cap on aggregated section matches returned by `wikiSearch`. */
const MAX_MATCHES = 20;

/** One aggregated section hit, with a project-qualified `<project>/<relpath>` uri. */
export interface WikiSearchMatch {
  uri: string;
  section: string;
  score: number;
  snippet?: string;
}

export interface WikiSearchResult {
  availableWikis: string[];
  matches: WikiSearchMatch[];
}

/** One bound wiki's grounded answer, tagged by project. */
export interface WikiAskAnswer {
  project: string;
  text: string;
  citations: string[];
  evidenceCount: number;
}

export interface WikiAskResult {
  availableWikis: string[];
  answers: WikiAskAnswer[];
}

/** The bound wikis on a workspace: every project whose wiki nature is materialized. */
async function boundWikis(workspace: Workspace): Promise<Project[]> {
  const projects = await workspace.getProjects();
  const flags = await Promise.all(projects.map((p) => wikiNatureOf(p).exists()));
  return projects.filter((_, i) => flags[i]);
}

/** A project's source resource set as project-relative uris (skips dot-segments). */
async function listResources(project: Project): Promise<string[]> {
  const filesApi = project.workspace.files;
  const base = project.path.replace(/^\/+|\/+$/g, "");
  const out: string[] = [];
  for await (const info of filesApi.list(project.path, { recursive: true })) {
    if (info.kind !== "file") continue;
    const p = info.path.replace(/^\/+/, "");
    const uri = base === "" ? p : p.startsWith(`${base}/`) ? p.slice(base.length + 1) : undefined;
    if (uri === undefined) continue;
    if (uri.split("/").some((seg) => seg.startsWith("."))) continue;
    out.push(uri);
  }
  return out;
}

/** Resolve masks to per-wiki targets, listing resources only when an inner glob needs them. */
async function targetsFor(
  workspace: Workspace,
  paths: string[] | undefined,
): Promise<{ wikis: Project[]; targets: ReturnType<typeof resolveWikiMasks> }> {
  const wikis = await boundWikis(workspace);
  const needResources = (paths ?? []).some((m) => m.includes("/"));
  const withResources: WikiResources[] = needResources
    ? await Promise.all(
        wikis.map(async (w) => ({ name: w.projectName, resources: await listResources(w) })),
      )
    : wikis.map((w) => ({ name: w.projectName, resources: [] }));
  return { wikis, targets: resolveWikiMasks(paths, withResources) };
}

/**
 * Cross-wiki retrieval: fan `SearchAdapter.search` out over the wikis the masks select,
 * aggregate the section matches (each carrying a full `<project>/<relpath>` uri), and
 * return them merged/sorted by score. Shared by the `wiki_search` chat tool and the
 * `wiki:search` command.
 */
export async function wikiSearch(
  workspace: Workspace,
  input: { query: string; paths?: string[] },
): Promise<WikiSearchResult> {
  const { wikis, targets } = await targetsFor(workspace, input.paths);
  const byName = new Map(wikis.map((w) => [w.projectName, w]));
  const matches: WikiSearchMatch[] = [];
  for (const t of targets) {
    const project = byName.get(t.project);
    const search = project?.getAdapter(SearchAdapter);
    if (!project || !search) continue;
    await wikiConfigOf(project).load();
    const docs = await search.search({
      query: input.query,
      paths: t.paths.length > 0 ? t.paths : undefined,
    });
    for (const d of docs) {
      for (const s of d.sections) {
        matches.push({
          uri: `${t.project}/${d.uri}`,
          section: s.sectionKey,
          score: s.score,
          snippet: s.snippet,
        });
      }
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return {
    availableWikis: wikis.map((w) => w.projectName),
    matches: matches.slice(0, MAX_MATCHES),
  };
}

/**
 * Per-wiki grounded answers: run scoped `WikiQuery.ask` (via `WikiNature.query`) on each
 * wiki the masks select, returning the answers tagged by project. Shared by the `wiki_ask`
 * chat tool and the `wiki:ask` command.
 */
export async function wikiAsk(
  workspace: Workspace,
  input: { question: string; paths?: string[] },
): Promise<WikiAskResult> {
  const { wikis, targets } = await targetsFor(workspace, input.paths);
  const byName = new Map(wikis.map((w) => [w.projectName, w]));
  const answers: WikiAskAnswer[] = [];
  for (const t of targets) {
    const project = byName.get(t.project);
    if (!project) continue;
    const progress = await wikiNatureOf(project).query(input.question, {
      paths: t.paths.length > 0 ? t.paths : undefined,
    });
    const answer = await progress.complete();
    answers.push({
      project: t.project,
      text: answer.text,
      citations: answer.citations,
      evidenceCount: answer.evidenceCount,
    });
  }
  return { availableWikis: wikis.map((w) => w.projectName), answers };
}
