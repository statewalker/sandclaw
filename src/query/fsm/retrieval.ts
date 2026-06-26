import type { Project } from "@statewalker/workspace.core";
import { WikiOutlierIndex, WikiTopicIndex } from "../../knowledge/indexes.js";
import {
  ResourceTextContentCache,
  WikiPageMeta,
  WikiPageSummary,
} from "../../knowledge/page-adapters.js";
import {
  type DocumentMeta,
  type GlobalOutlier,
  type GlobalTopic,
  type SummaryNode,
  summaryLeaves,
  summaryPath,
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

/** Build an evidence section from a page's summary tree: a leaf's routing fields (title + summary). */
export async function evidenceFor(
  project: Project,
  uri: string,
  sectionKey: string,
): Promise<EvidenceSection | undefined> {
  const resource = await project.getProjectResource(uri);
  if (!resource) return undefined;
  const summary = await resource.requireAdapter(WikiPageSummary).get();
  const section = summary ? summaryLeaves(summary).find((s) => s.key === sectionKey) : undefined;
  if (!section) return undefined;
  return { uri, sectionKey, title: section.title, summary: section.summary };
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
    const order = new Map((summary ? summaryLeaves(summary) : []).map((s, i) => [s.key, i]));
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

/**
 * Build the rolling-summarization input: candidate sections grouped by document, each leaf
 * rendered with its ancestor TOC path (root→…→leaf, each node's title + summary) as `<context>`
 * and its raw `<content>` (sliced by the leaf's line range). Documents are split into
 * char-budget-bounded batches; a document spanning a boundary repeats its `<document>` header in
 * each batch (so every batch carries the document summary). Returns one rendered `<sources>`
 * payload per batch plus the `(ref → EvidenceSection)` map for mechanical grounding.
 */
export interface RollingBatch {
  /** The `<document>…</document>` blocks for this batch (concatenated). */
  payload: string;
  /** ref → EvidenceSection for every section rendered in this batch. */
  sections: Map<string, EvidenceSection>;
}

/** XML-attribute-safe (drop quotes/newlines that would break a `title="…"`). */
function attr(s: string): string {
  return s.replace(/["\n\r]+/g, " ").trim();
}

export async function buildRollingBatches(
  project: Project,
  candidates: EvidenceSection[],
  charBudget: number,
): Promise<RollingBatch[]> {
  const projectKey = project.projectName;
  // Group candidates by document, first-seen order.
  const byDoc = new Map<string, EvidenceSection[]>();
  for (const c of candidates) {
    const list = byDoc.get(c.uri) ?? [];
    list.push(c);
    byDoc.set(c.uri, list);
  }

  // Each document yields one or more `<document>` blocks (split when its sections exceed budget).
  const docBlocks: { block: string; sections: Map<string, EvidenceSection> }[] = [];
  for (const [uri, sectionList] of byDoc) {
    const resource = await project.getProjectResource(uri);
    const summary = await resource?.requireAdapter(WikiPageSummary).get();
    if (!summary) continue;
    const raw = (await resource?.requireAdapter(ResourceTextContentCache).getTextContent()) ?? "";
    const lines = raw.split("\n");
    const header = `<document title="${attr(summary.title)}">\n<document_summary>\n${summary.summary}\n</document_summary>`;
    const headerCost = header.length + 16;

    // Render each candidate leaf: ancestor path context (between root and leaf) + raw content.
    const rendered = sectionList.flatMap((ev) => {
      const leaf = summaryLeaves(summary).find((s) => s.key === ev.sectionKey);
      if (!leaf) return [];
      const path = summaryPath(summary, ev.sectionKey); // [root, …, leaf]
      const ancestors: SummaryNode[] = path.slice(1, -1); // drop root (== document_summary) and the leaf
      const context = ancestors
        .map((a) => `<toc title="${attr(a.title)}">\n${a.summary}\n</toc>`)
        .join("\n");
      const content = lines.slice(leaf.startLine, leaf.endLine + 1).join("\n");
      const ref = toCanonical({ key: projectKey, path: uri, section: ev.sectionKey }, projectKey);
      const block = [
        `<section ref="${ref}">`,
        context ? `<context>\n${context}\n</context>` : "<context/>",
        `<title>\n${ev.title}\n</title>`,
        `<content>\n${content}\n</content>`,
        "</section>",
      ].join("\n");
      return [{ ref, ev, block, cost: block.length + 8 }];
    });

    // Pack this document's sections into header-prefixed blocks that fit the budget.
    let cur: typeof rendered = [];
    let curCost = headerCost;
    const flush = () => {
      if (cur.length === 0) return;
      const block = `${header}\n${cur.map((r) => r.block).join("\n")}\n</document>`;
      docBlocks.push({ block, sections: new Map(cur.map((r) => [r.ref, r.ev])) });
      cur = [];
      curCost = headerCost;
    };
    for (const r of rendered) {
      if (cur.length > 0 && curCost + r.cost > charBudget) flush();
      cur.push(r);
      curCost += r.cost;
    }
    flush();
  }

  // Greedily pack `<document>` blocks into batches under the char budget.
  const batches: RollingBatch[] = [];
  let payload: string[] = [];
  let sections = new Map<string, EvidenceSection>();
  let size = 0;
  const flushBatch = () => {
    if (payload.length === 0) return;
    batches.push({ payload: payload.join("\n\n"), sections });
    payload = [];
    sections = new Map();
    size = 0;
  };
  for (const d of docBlocks) {
    if (payload.length > 0 && size + d.block.length > charBudget) flushBatch();
    payload.push(d.block);
    for (const [ref, ev] of d.sections) sections.set(ref, ev);
    size += d.block.length;
  }
  flushBatch();
  return batches;
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
