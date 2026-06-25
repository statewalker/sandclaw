import type { Project } from "@statewalker/workspace.core";
import { WikiOutlierIndex, WikiTopicIndex } from "../../knowledge/indexes.js";
import { WikiPageMeta, WikiPageSummary } from "../../knowledge/page-adapters.js";
import type {
  ChapterNode,
  DetailTable,
  DocumentMeta,
  GlobalOutlier,
  GlobalTopic,
} from "../../knowledge/types.js";
import type { SearchAdapter } from "../../search/index.js";
import { parseWikiUri, toCanonical } from "../../uri/wiki-uri.js";
import type { AnswerTopic, EvidenceSection } from "../progress.js";
import type { QueryLog } from "./llm-call.js";
import type { Subject } from "./query-context.js";

/** `${uri}#${sectionKey}` — the dedup identity of an evidence section. */
export function sectionId(uri: string, sectionKey: string): string {
  return `${uri}#${sectionKey}`;
}

/** A per-document topic reached through a selected global class. */
export interface DocTopicCandidate {
  /** `<baseUri>#<per-doc-topic-key>` — the reference uri. */
  uri: string;
  baseUri: string;
  perDocKey: string;
  name: string;
  description?: string;
  brief: string;
  sectionKeys: string[];
}

/** Read the global topic + outlier indexes into key-maps. */
export async function readClassIndexes(
  project: Project,
): Promise<{ topics: Map<string, GlobalTopic>; outliers: Map<string, GlobalOutlier> }> {
  const topics = new Map<string, GlobalTopic>();
  const outliers = new Map<string, GlobalOutlier>();
  for await (const t of project.requireAdapter(WikiTopicIndex).leaves()) topics.set(t.key, t);
  for await (const o of project.requireAdapter(WikiOutlierIndex).list()) outliers.set(o.key, o);
  return { topics, outliers };
}

/**
 * Resolve selected global classes to their per-document topic candidates.
 * Deduplicates by reference uri; reads each document's meta at most once.
 */
export async function buildDocTopicCandidates(
  project: Project,
  selected: { references: { uri: string }[] }[],
  declsOf: (meta: DocumentMeta) => DocumentMeta["topics"] | DocumentMeta["outliers"],
  metaCache: Map<string, DocumentMeta | undefined>,
): Promise<DocTopicCandidate[]> {
  const byUri = new Map<string, DocTopicCandidate>();
  for (const cls of selected) {
    for (const ref of cls.references) {
      if (byUri.has(ref.uri)) continue;
      const { path: baseUri, section: perDocKey } = parseWikiUri(ref.uri);
      if (!perDocKey) continue;
      if (!metaCache.has(baseUri)) {
        const resource = await project.getProjectResource(baseUri);
        metaCache.set(baseUri, await resource?.requireAdapter(WikiPageMeta).get());
      }
      const meta = metaCache.get(baseUri);
      const decl = meta ? declsOf(meta).find((d) => d.key === perDocKey) : undefined;
      if (!decl) continue;
      byUri.set(ref.uri, {
        uri: ref.uri,
        baseUri,
        perDocKey,
        name: decl.name,
        description: decl.description,
        brief: decl.brief,
        sectionKeys: decl.sectionKeys,
      });
    }
  }
  return [...byUri.values()];
}

/**
 * Whether `uri` falls under any of `paths` (component-boundary prefix match, the
 * same semantics the search index applies). An empty/omitted scope matches everything.
 */
export function withinScope(uri: string, paths?: string[]): boolean {
  if (!paths || paths.length === 0) return true;
  return paths.some((p) => {
    const prefix = p.replace(/\/+$/, "");
    return uri === prefix || uri.startsWith(`${prefix}/`);
  });
}

/**
 * Mechanical hybrid search for one subject → candidate sections. The subject's
 * `ftsQueries` keywords drive full-text retrieval; its `semanticQuery` (a
 * hypothetical answer, HyDE) is embedded for the semantic side. Logs the exact
 * queries used and the hits they yielded (alongside the topic-descent log) so the
 * retrieval that found each fragment is visible.
 */
export async function hybridSearch(
  search: SearchAdapter,
  log: QueryLog,
  subject: Subject,
  paths?: string[],
): Promise<{ uri: string; sectionKey: string }[]> {
  const ftsQueries = subject.ftsQueries.length > 0 ? subject.ftsQueries : [subject.prompt];
  const matches = await search.search({
    query: subject.semanticQuery,
    ftsQueries,
    modes: ["fts", "vector"],
    paths,
  });
  const out: { uri: string; sectionKey: string }[] = [];
  // Split the surfaced sections by provenance so the log shows which the full-text
  // ladder found vs which the semantic (vector) query found (a section may be both).
  const ftsSections: string[] = [];
  const vectorSections: string[] = [];
  for (const m of matches) {
    for (const s of m.sections) {
      out.push({ uri: m.uri, sectionKey: s.sectionKey });
      const id = sectionId(m.uri, s.sectionKey);
      if (s.modes.includes("fts")) ftsSections.push(id);
      if (s.modes.includes("vector")) vectorSections.push(id);
    }
  }
  log.info("hybrid search", {
    semanticQuery: subject.semanticQuery,
    ftsQueries,
    documents: matches.length,
    sections: out.length,
    ftsSections,
    vectorSections,
  });
  return out;
}

/** Build an evidence section from a page's summary: its routing fields plus answer-tier tables. */
export async function evidenceFor(
  project: Project,
  uri: string,
  sectionKey: string,
): Promise<EvidenceSection | undefined> {
  const resource = await project.getProjectResource(uri);
  if (!resource) return undefined;
  const summary = await resource.requireAdapter(WikiPageSummary).get();
  const section = summary?.sections.find((s) => s.key === sectionKey);
  if (!section) return undefined;
  return {
    uri,
    sectionKey,
    title: section.title,
    summary: section.summary,
    details: section.details,
    tables: section.tables,
  };
}

/**
 * Deduplicate + document-order an evidence pool: group by document, and within a
 * document order sections by their natural order in the page summary. Documents
 * appear in first-seen order; sections from one document stay contiguous.
 */
export async function orderEvidence(
  project: Project,
  evidence: EvidenceSection[],
): Promise<EvidenceSection[]> {
  const byDoc = new Map<string, EvidenceSection[]>();
  for (const e of evidence) {
    const list = byDoc.get(e.uri) ?? [];
    list.push(e);
    byDoc.set(e.uri, list);
  }
  const out: EvidenceSection[] = [];
  for (const [uri, list] of byDoc) {
    const resource = await project.getProjectResource(uri);
    const summary = await resource?.requireAdapter(WikiPageSummary).get();
    const order = new Map(summary?.sections.map((s, i) => [s.key, i]) ?? []);
    list.sort((a, b) => (order.get(a.sectionKey) ?? 0) - (order.get(b.sectionKey) ?? 0));
    out.push(...list);
  }
  return out;
}

/**
 * Aggregate the topic/outlier classes the retrieved evidence touches: for each
 * evidence page read its `WikiPageMeta`, keep every declared class whose
 * `sectionKeys` intersect the retrieved sections, and cite each covered section
 * as a canonical local reference (`/path#section`). Classes are unioned across pages by key.
 */
export async function aggregateClasses(
  project: Project,
  evidence: EvidenceSection[],
): Promise<{ topics: AnswerTopic[]; outliers: AnswerTopic[] }> {
  const key = project.projectName;
  const sectionsByUri = new Map<string, Set<string>>();
  for (const e of evidence) {
    const set = sectionsByUri.get(e.uri) ?? new Set<string>();
    set.add(e.sectionKey);
    sectionsByUri.set(e.uri, set);
  }

  const topics = new Map<string, AnswerTopic>();
  const outliers = new Map<string, AnswerTopic>();
  const collect = (
    decls: { key: string; name: string; description?: string; sectionKeys: string[] }[],
    uri: string,
    covered: Set<string>,
    target: Map<string, AnswerTopic>,
  ) => {
    for (const d of decls) {
      const hits = d.sectionKeys.filter((sk) => covered.has(sk));
      if (hits.length === 0) continue;
      const agg =
        target.get(d.key) ??
        ({ key: d.key, name: d.name, description: d.description, citations: [] } as AnswerTopic);
      for (const sk of hits)
        agg.citations.push({ uri: toCanonical({ key, path: uri, section: sk }, key) });
      target.set(d.key, agg);
    }
  };

  for (const [uri, covered] of sectionsByUri) {
    const resource = await project.getProjectResource(uri);
    const meta = await resource?.requireAdapter(WikiPageMeta).get();
    if (!meta) continue;
    collect(meta.topics, uri, covered, topics);
    collect(meta.outliers, uri, covered, outliers);
  }
  return { topics: [...topics.values()], outliers: [...outliers.values()] };
}

/**
 * Mechanical citation filter: keep only the claimed citations that resolve to a
 * retrieved `(uri, sectionKey)`; report a caveat when any were dropped.
 */
export function filterCitations(
  evidence: EvidenceSection[],
  claimed: string[],
): { citations: string[]; caveats: string[] } {
  const ids = new Set(evidence.map((e) => sectionId(e.uri, e.sectionKey)));
  const citations = claimed.filter((c) => {
    try {
      const ref = parseWikiUri(c);
      return ref.section !== undefined && ids.has(sectionId(ref.path, ref.section));
    } catch {
      return false;
    }
  });
  const caveats =
    citations.length < claimed.length
      ? ["Some citations did not resolve to retrieved evidence and were dropped."]
      : [];
  return { citations, caveats };
}

/** Map each section key to its leaf chapter (key/title/summary) by walking a document outline. */
export function sectionChapters(
  outline: ChapterNode[],
): Map<string, { key: string; title: string; summary: string }> {
  const map = new Map<string, { key: string; title: string; summary: string }>();
  const walk = (nodes: ChapterNode[]): void => {
    for (const n of nodes) {
      if (n.sectionKeys) {
        for (const k of n.sectionKeys)
          map.set(k, { key: n.key, title: n.title, summary: n.summary });
      }
      if (n.children) walk(n.children);
    }
  };
  walk(outline);
  return map;
}

/**
 * Render one document's slice of a summarize batch: a `<document>` block carrying the
 * document title + summary header, its retrieved sections grouped under their parent
 * `<chapter>` (title + summary), each section tagged with its `ref` (the citation token the
 * summarizer must cite), title, prior narrative description, and raw content. Grouping by
 * document keeps facts single-document; the chapter layer gives intra-document context. The
 * chapter wrapper is skipped when the only chapter just mirrors the document (a small
 * document's mechanical single-chapter outline) to avoid redundancy.
 */
export function renderDocumentBlock(input: {
  title: string;
  summary: string;
  chapters: {
    title: string;
    summary: string;
    sections: {
      ref: string;
      title: string;
      description: string;
      details: string;
      tables?: string;
    }[];
  }[];
}): string {
  const parts: string[] = [
    `<document title="${input.title}">`,
    `<document_summary>\n${input.summary}\n</document_summary>`,
  ];
  const flat = input.chapters.length === 1 && input.chapters[0]?.title === input.title;
  for (const ch of input.chapters) {
    if (!flat) {
      parts.push(
        `<chapter title="${ch.title}">`,
        `<chapter_summary>\n${ch.summary}\n</chapter_summary>`,
      );
    }
    for (const s of ch.sections) {
      parts.push(
        `<section ref="${s.ref}">`,
        `<section_title>\n${s.title}\n</section_title>`,
        `<section_summary>\n${s.description}\n</section_summary>`,
      );
      // The section's exhaustive facts are the fact source; tables carry its structured data.
      parts.push(`<details>\n${s.details}\n</details>`);
      if (s.tables) parts.push(`<tables>\n${s.tables}\n</tables>`);
      parts.push("</section>");
    }
    if (!flat) parts.push("</chapter>");
  }
  parts.push("</document>");
  return parts.join("\n");
}

/**
 * Render a section's tables as markdown — one `#### caption` heading followed by a
 * GitHub-flavoured markdown table (header row + separator + rows). Empty input
 * yields an empty string.
 */
export function renderSectionTables(tables: DetailTable[]): string {
  return tables
    .map((t) => {
      const header = `| ${t.columns.join(" | ")} |`;
      const sep = `| ${t.columns.map(() => "---").join(" | ")} |`;
      const rows = t.rows.map((r) => `| ${r.join(" | ")} |`);
      return [`#### ${t.caption}`, header, sep, ...rows].join("\n");
    })
    .join("\n\n");
}

/**
 * Mechanically ground a summarize batch's returned facts: keep only citations supplied in the
 * batch (`refToUri` maps section ref → its document uri), drop a fact left with no valid citation,
 * and drop any fact whose citations span more than one document — so a cross-document conflation
 * cannot survive as a fact. Returns the surviving `{ statement, citations }` facts.
 */
export function filterGroundedFacts(
  rawFacts: { statement: string; citations: string[] }[],
  refToUri: ReadonlyMap<string, string>,
): { statement: string; citations: string[] }[] {
  const out: { statement: string; citations: string[] }[] = [];
  for (const f of rawFacts) {
    const citations = f.citations.filter((c) => refToUri.has(c));
    const docs = new Set(citations.map((c) => refToUri.get(c)));
    if (citations.length > 0 && docs.size === 1) out.push({ statement: f.statement, citations });
  }
  return out;
}

/** A candidate section as offered to the relevance filter (no raw content — title + summary only). */
export interface FilterSection {
  /** The section URI (`<docUri>#<sectionKey>`) the filter echoes back when it keeps the section. */
  uri: string;
  docUri: string;
  docTitle: string;
  title: string;
  summary: string;
}

/** One document's slice of a filter batch: its title plus the candidate sections in that batch. */
export interface FilterDoc {
  docUri: string;
  title: string;
  sections: { uri: string; title: string; summary: string }[];
}

/**
 * Pack doc-grouped candidate sections into batches whose combined size stays under
 * `charBudget` (a token-window proxy at ~4 chars/token). Sections are consumed in the
 * given order, so order by score/document upstream; a document spanning a batch
 * boundary simply repeats its title in each batch.
 */
export function packFilterBatches(sections: FilterSection[], charBudget: number): FilterDoc[][] {
  const batches: FilterDoc[][] = [];
  let cur = new Map<string, FilterDoc>();
  let size = 0;
  const flush = () => {
    if (cur.size > 0) {
      batches.push([...cur.values()]);
      cur = new Map();
      size = 0;
    }
  };
  for (const s of sections) {
    const cost = s.uri.length + s.title.length + s.summary.length + 16;
    if (size > 0 && size + cost > charBudget) flush();
    const doc = cur.get(s.docUri) ?? { docUri: s.docUri, title: s.docTitle, sections: [] };
    doc.sections.push({ uri: s.uri, title: s.title, summary: s.summary });
    cur.set(s.docUri, doc);
    size += cost;
  }
  flush();
  return batches;
}
