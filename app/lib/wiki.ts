import {
  ResourceTextContentCache,
  WikiOutlierIndex,
  WikiPageMeta,
  WikiPageSummary,
  WikiTopicIndex,
} from "@statewalker/resources-wiki";
import { parseCitationUri, sectionToPdfPage } from "./pages";
import type {
  CitationBrief,
  ResolvedCitation,
  TopicDetail,
  TopicReference,
} from "./types";
import { filesApi, getProject } from "./wiki-repo";

// Each project IS its own wiki — every resolver below takes the `project` directly
// and reads exclusively through the `@statewalker/resources-wiki` adapters.

/** Resolve one `file#anchor` citation against the project's wiki. */
export async function resolveCitation(
  project: string,
  uri: string,
): Promise<ResolvedCitation> {
  const { file, anchor } = parseCitationUri(uri);
  const base: ResolvedCitation = { uri, file, anchor, found: false };

  const proj = await getProject(project);
  if (!proj) return base;
  const resource = await proj.getProjectResource(file);
  const summary = await resource?.getAdapter(WikiPageSummary)?.get();
  if (!resource || !summary) return base;

  const sec = summary.sections.find((s) => s.key === anchor);
  const meta = await resource.getAdapter(WikiPageMeta)?.get();
  const topics = (meta?.topics ?? []).map((t) => ({
    key: t.key,
    name: t.name,
  }));

  let page = 1;
  if (sec) {
    const raw = await resource
      .requireAdapter(ResourceTextContentCache)
      .getTextContent();
    if (raw) page = sectionToPdfPage(raw, sec.startLine);
  }

  return {
    uri,
    file,
    anchor,
    found: true,
    docTitle: summary.title ?? file,
    sectionTitle: sec?.title ?? anchor,
    sectionSummary: sec?.summary ?? "",
    topics,
    page,
    hasPdf: await pdfExists(project, file),
  };
}

/** Lightweight title-only resolution for the citations list. */
export async function resolveCitationBrief(
  project: string,
  uri: string,
): Promise<CitationBrief> {
  const { file, anchor } = parseCitationUri(uri);
  const proj = await getProject(project);
  const resource = await proj?.getProjectResource(file);
  const summary = await resource?.getAdapter(WikiPageSummary)?.get();
  if (!summary) return { uri, found: false };
  const sec = summary.sections.find((s) => s.key === anchor);
  return {
    uri,
    found: true,
    docTitle: summary.title ?? file,
    sectionTitle: sec?.title ?? anchor,
  };
}

export async function resolveCitationBriefs(
  project: string,
  uris: string[],
): Promise<CitationBrief[]> {
  return Promise.all(uris.map((u) => resolveCitationBrief(project, u)));
}

export interface TopicSummary {
  key: string;
  name: string;
  description: string;
  /** Number of source references the global index records for it. */
  referenceCount: number;
}

/** All global topic classes for a project, alphabetical — for the browse view. */
export async function listTopics(project: string): Promise<TopicSummary[]> {
  const proj = await getProject(project);
  if (!proj) return [];
  const out: TopicSummary[] = [];
  for await (const t of proj.requireAdapter(WikiTopicIndex).list()) {
    out.push({
      key: t.key,
      name: t.name,
      description: t.description ?? "",
      referenceCount: t.references.length,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve a topic/outlier to its description and every covering section. */
export async function resolveTopic(
  project: string,
  key: string,
  kind: "topic" | "outlier",
): Promise<TopicDetail | null> {
  const proj = await getProject(project);
  if (!proj) return null;
  const cls =
    kind === "outlier"
      ? await proj.requireAdapter(WikiOutlierIndex).get(key)
      : await proj.requireAdapter(WikiTopicIndex).get(key);
  if (!cls) return null;

  // The global index references documents by uri; expand each to the real sections
  // that cover the class (from the page meta's `sectionKeys`) so links resolve to
  // actual citations with summaries and page numbers.
  const references: TopicReference[] = [];
  for (const ref of cls.references) {
    // References are `<uri>#<perDocKey>`; the per-doc key locates the document's
    // own declaration (which, for outliers, may differ from the global class key).
    const { file, anchor } = parseCitationUri(ref.uri);
    const resource = await proj.getProjectResource(file);
    const summary = await resource?.requireAdapter(WikiPageSummary).get();
    const docTitle = summary?.title ?? file;
    const meta = await resource?.requireAdapter(WikiPageMeta).get();
    const entry = (kind === "outlier" ? meta?.outliers : meta?.topics)?.find(
      (c) => c.key === anchor || c.key === key,
    );
    const sectionKeys = entry?.sectionKeys ?? [];

    if (sectionKeys.length === 0) {
      references.push({
        uri: `${file}#${key}`,
        docTitle,
        sectionTitle: entry?.name ?? cls.name,
        sectionSummary: "",
      });
      continue;
    }
    for (const sk of sectionKeys) {
      const sec = summary?.sections.find((s) => s.key === sk);
      references.push({
        uri: `${file}#${sk}`,
        docTitle,
        sectionTitle: sec?.title ?? sk,
        sectionSummary: sec?.summary ?? "",
      });
    }
  }
  return {
    key,
    name: cls.name,
    description: cls.description,
    kind,
    references,
  };
}

/** FilesApi-relative path to a citation's source PDF, or null if absent / not a PDF. */
export async function resolvePdfPath(
  project: string,
  file: string,
): Promise<string | null> {
  const rel = file.replace(/^\/+/, "");
  if (!/\.pdf$/i.test(rel) || rel.split("/").some((s) => s === ".."))
    return null;
  const path = `${project}/${rel}`;
  return (await filesApi().exists(path)) ? path : null;
}

async function pdfExists(project: string, file: string): Promise<boolean> {
  return (await resolvePdfPath(project, file)) !== null;
}
