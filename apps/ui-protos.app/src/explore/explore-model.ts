import {
  documents as askDocuments,
  type DocumentBlock,
  dupontBudget,
  dupontStart,
  type GroundedAnswer,
  leroyTimber,
  type SearchEntry,
} from "../ask/answers.js";

// What the indexes on this computer know about the user's folder, and how a question
// went through them. Shapes follow `@statewalker/indexer-search`: each index returns
// hits, the SearchPipeline merges them into `PipelineEntry`s ({ blockId, path, score,
// citation }), reranks them, and the answer cites the ones it uses. Pure functions;
// the views call them.

/** The four indexes: full-text words, vector meaning, topics, table of contents. */
export type IndexKind = "words" | "meaning" | "topics" | "contents";

export const indexKinds: IndexKind[] = ["words", "meaning", "topics", "contents"];

export const indexWords: Record<IndexKind, { label: string; finds: string }> = {
  words: { label: "Words", finds: "the same words" },
  meaning: { label: "Meaning", finds: "a similar meaning, even in other words" },
  topics: { label: "Topics", finds: "passages filed under a matching topic" },
  contents: { label: "Contents", finds: "sections whose heading matches" },
};

/** One result of one index: a passage, its score in that index, and why. */
export interface IndexHit {
  index: IndexKind;
  path: string;
  blockId: string;
  score: number;
  explain: string;
}

/** A passage found by one or more indexes: a `PipelineEntry`, tagged by index. */
export interface MergedResult extends SearchEntry {
  /** Each index that found it, with its rank (1-based) and score there. */
  foundBy: (IndexHit & { rank: number })[];
}

// --- The documents, as the indexes see them ----------------------------------

/** D1's documents, plus the files the explorer also needs. */
export const documents: Record<string, DocumentBlock[]> = {
  ...askDocuments,
  "Clients/Leroy — brief.pdf": [
    {
      blockId: "l1",
      heading: "Leroy — roof renovation",
      text: "Replace the roof timber of the barn at Saint-Genis. Budget to be agreed after the survey.",
    },
    { blockId: "l2", heading: "Survey", text: "Survey of the barn roof planned for November." },
  ],
  "Finance/2026-Q3.xlsx": [
    { blockId: "q1", heading: "Q3 summary", text: "Revenue €61,200; materials €22,900." },
    { blockId: "q2", heading: "Suppliers", text: "Bois Lyonnais €9,800; Leroy Merlin €1,250." },
  ],
  "Finance/invoices/INV-0412.pdf": [
    {
      blockId: "i1",
      heading: "Invoice INV-0412",
      text: "Bois Lyonnais — oak flooring 22 mm, Dupont site. €6,120 excl. VAT, paid 28 September.",
    },
  ],
};

export const block = (path: string, blockId: string) =>
  documents[path]?.find((b) => b.blockId === blockId);

/** The heading a block sits under ("" before the first heading). */
export function sectionOf(path: string, blockId: string): string {
  let heading = "";
  for (const b of documents[path] ?? []) {
    if (b.heading) heading = b.heading;
    if (b.blockId === blockId) return heading;
  }
  return heading;
}

// --- Topics ------------------------------------------------------------------

export interface BlockRef {
  path: string;
  blockId: string;
}

export interface Topic {
  name: string;
  children?: Topic[];
  /** The passages filed under this topic (leaves only). */
  covers?: BlockRef[];
}

const offer = "Clients/Dupont — offer.docx";
const meeting = "Notes/meeting 2026-10-02.md";
const notes = "Clients/Dupont — notes.md";
const ref = (path: string, ...ids: string[]) => ids.map((blockId) => ({ path, blockId }));

export const topics: Topic[] = [
  {
    name: "Clients",
    children: [
      {
        name: "Dupont",
        children: [
          { name: "Kitchen works", covers: [...ref(offer, "o1", "o3"), ...ref(meeting, "m2")] },
          {
            name: "Oak beams",
            covers: [...ref(meeting, "m3", "m4"), ...ref(offer, "o2")],
          },
          {
            name: "Schedule",
            covers: [...ref(meeting, "m2", "m4"), ...ref(offer, "o3", "o4"), ...ref(notes, "n1")],
          },
          {
            name: "Price",
            covers: [...ref(offer, "o5"), ...ref("Finance/invoices/INV-0412.pdf", "i1")],
          },
          { name: "Contacts", covers: [...ref(meeting, "m1"), ...ref(notes, "n2")] },
        ],
      },
      {
        name: "Leroy",
        children: [{ name: "Roof timber", covers: ref("Clients/Leroy — brief.pdf", "l1", "l2") }],
      },
    ],
  },
  {
    name: "Finance",
    children: [
      { name: "Q3", covers: ref("Finance/2026-Q3.xlsx", "q1", "q2") },
      { name: "Invoices", covers: ref("Finance/invoices/INV-0412.pdf", "i1") },
      {
        name: "Suppliers",
        covers: [
          ...ref("Finance/2026-Q3.xlsx", "q2"),
          ...ref(offer, "o2"),
          ...ref("Finance/invoices/INV-0412.pdf", "i1"),
        ],
      },
    ],
  },
];

/** The documents a topic and its subtopics cover, each with its passages in document order. */
export function coverage(topic: Topic): { path: string; blockIds: string[] }[] {
  const refs: BlockRef[] = [];
  const walk = (t: Topic) => {
    refs.push(...(t.covers ?? []));
    t.children?.forEach(walk);
  };
  walk(topic);
  return [...Map.groupBy(refs, (r) => r.path)].map(([path, rs]) => {
    const ids = new Set(rs.map((r) => r.blockId));
    return {
      path,
      blockIds: (documents[path] ?? []).map((b) => b.blockId).filter((id) => ids.has(id)),
    };
  });
}

/** Every topic path ("Clients ▸ Dupont ▸ Schedule") that files a passage. */
export function topicsOf(path: string, blockId: string): string[] {
  const found: string[] = [];
  const walk = (t: Topic, trail: string[]) => {
    const names = [...trail, t.name];
    if (t.covers?.some((r) => r.path === path && r.blockId === blockId))
      found.push(names.join(" ▸ "));
    for (const c of t.children ?? []) walk(c, names);
  };
  for (const t of topics) walk(t, []);
  return found;
}

/** A document's table of contents as the index sees it: sections, their passages, topics. */
export function tableOfContents(path: string) {
  const sections: { heading: string; blockIds: string[]; topics: string[] }[] = [];
  for (const b of documents[path] ?? []) {
    if (b.heading || sections.length === 0)
      sections.push({ heading: b.heading ?? "", blockIds: [], topics: [] });
    const section = sections.at(-1);
    if (!section) continue;
    section.blockIds.push(b.blockId);
    for (const t of topicsOf(path, b.blockId))
      if (!section.topics.includes(t)) section.topics.push(t);
  }
  return sections;
}

// --- Merging what the indexes return -------------------------------------------

/** Reciprocal-rank fusion constant: a passage ranked 1st in one index scores 1/61. */
const K = 60;

/**
 * One list from the per-index lists: each passage once, tagged with every index
 * that found it, ordered by reciprocal-rank fusion (found high, by several, first).
 */
export function mergeHits(perIndex: Partial<Record<IndexKind, IndexHit[]>>): MergedResult[] {
  const byKey = new Map<string, MergedResult>();
  for (const index of indexKinds) {
    (perIndex[index] ?? []).forEach((hit, i) => {
      const key = `${hit.path}#${hit.blockId}`;
      const merged = byKey.get(key) ?? {
        path: hit.path,
        blockId: hit.blockId,
        score: 0,
        citation: {
          blockId: hit.blockId,
          snippet: block(hit.path, hit.blockId)?.text ?? "",
          relevance: 0,
          context: sectionOf(hit.path, hit.blockId),
        },
        foundBy: [],
      };
      merged.foundBy.push({ ...hit, rank: i + 1 });
      merged.score += 1 / (K + i + 1);
      byKey.set(key, merged);
    });
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

export function filterByIndex(results: MergedResult[], only: IndexKind | "all"): MergedResult[] {
  return only === "all" ? results : results.filter((r) => r.foundBy.some((f) => f.index === only));
}

export function countByIndex(results: MergedResult[]): Record<IndexKind, number> {
  const counts = { words: 0, meaning: 0, topics: 0, contents: 0 };
  for (const r of results) for (const f of r.foundBy) counts[f.index]++;
  return counts;
}

// --- A scripted search over the mock documents ---------------------------------

const stopWords = new Set(
  "the and for does did what who how much are our was were with from about this that".split(" "),
);
/** Word families the "meaning" index treats as close. */
const meanings = [
  ["start", "begin", "date", "when", "schedule", "phase", "week", "planned"],
  ["beam", "timber", "wood", "oak", "flooring"],
  ["price", "cost", "budget", "total", "pay", "paid", "invoice", "€"],
  ["kitchen", "floor", "renovation", "works"],
  ["call", "contact", "present", "phone"],
];

const terms = (q: string) =>
  q
    .toLowerCase()
    .split(/[^\p{L}\p{N}€]+/u)
    .filter((t) => t.length > 2 && !stopWords.has(t));

const round = (n: number) => Math.round(n * 100) / 100;
const byScore = (a: IndexHit, b: IndexHit) => b.score - a.score;
const quoted = (ws: string[]) => ws.map((w) => `“${w}”`).join(", ");

/** What each index returns for a query, over the mock documents. */
export function searchIndexes(query: string): Record<IndexKind, IndexHit[]> {
  const ts = terms(query);
  const out: Record<IndexKind, IndexHit[]> = { words: [], meaning: [], topics: [], contents: [] };
  if (ts.length === 0) return out;
  const families = meanings.filter((f) => ts.some((t) => f.some((w) => t.startsWith(w))));
  for (const [path, blocks] of Object.entries(documents)) {
    for (const b of blocks) {
      const text = b.text.toLowerCase();
      const hit = (index: IndexKind, score: number, explain: string) =>
        out[index].push({ index, path, blockId: b.blockId, score: round(score), explain });

      const words = ts.filter((t) => text.includes(t));
      if (words.length) hit("words", words.length / ts.length, `contains ${quoted(words)}`);

      const close = families.filter((f) => f.some((w) => text.includes(w)));
      if (close.length)
        hit(
          "meaning",
          (0.95 * close.length) / families.length,
          `talks about ${quoted(close.map((f) => f[0] ?? ""))}`,
        );

      const topic = topicsOf(path, b.blockId).find((t) =>
        ts.some((w) => t.toLowerCase().includes(w)),
      );
      if (topic) {
        const n = ts.filter((w) => topic.toLowerCase().includes(w)).length;
        hit("topics", (0.8 * n) / ts.length, `filed under ${topic}`);
      }

      const heading = sectionOf(path, b.blockId);
      const inHeading = ts.filter((t) => heading.toLowerCase().includes(t));
      if (inHeading.length)
        hit("contents", (0.9 * inHeading.length) / ts.length, `under the heading “${heading}”`);
    }
  }
  for (const k of indexKinds) out[k].sort(byScore);
  return out;
}

// --- How a question was answered ----------------------------------------------

export type QueryType = "lex" | "vec" | "hyde";

/** The pipeline's record of one question: expand → search each index → rerank. */
export interface AnswerTrace {
  question: string;
  expanded: { type: QueryType; query: string }[];
  perIndex: Record<IndexKind, IndexHit[]>;
  /** Rerank score per passage (blockId): how well it answers the question. */
  rerank: Record<string, number>;
  /** Passages scoring below this are never used. */
  threshold: number;
}

const hits = (index: IndexKind, rows: [string, string, number, string][]): IndexHit[] =>
  rows.map(([path, blockId, score, explain]) => ({ index, path, blockId, score, explain }));

const invoice = "Finance/invoices/INV-0412.pdf";
const leroy = "Clients/Leroy — brief.pdf";
const q3 = "Finance/2026-Q3.xlsx";

const expandedOf = (answer: GroundedAnswer): AnswerTrace["expanded"] =>
  answer.searched.map((query, i) => ({
    type: (["lex", "vec", "hyde"] as const)[i % 3] ?? "lex",
    query,
  }));

export const traces: AnswerTrace[] = [
  {
    question: dupontStart.question,
    expanded: expandedOf(dupontStart),
    perIndex: {
      words: hits("words", [
        [notes, "n1", 0.67, "contains “Dupont”, “start date”"],
        [meeting, "m2", 0.5, "contains “Dupont”, “start”, “works”"],
        [offer, "o3", 0.33, "contains “start”, “works”"],
        [meeting, "m4", 0.33, "contains “Dupont”, “schedule”"],
      ]),
      meaning: hits("meaning", [
        [meeting, "m2", 0.89, "close to “when do the Dupont works begin”"],
        [offer, "o3", 0.81, "close to “Dupont schedule”"],
        [offer, "o4", 0.66, "close to “Dupont schedule”"],
        [notes, "n1", 0.58, "close to “Dupont start date”"],
      ]),
      topics: hits("topics", [
        [offer, "o3", 0.8, "filed under Clients ▸ Dupont ▸ Schedule"],
        [meeting, "m2", 0.8, "filed under Clients ▸ Dupont ▸ Schedule"],
        [offer, "o4", 0.8, "filed under Clients ▸ Dupont ▸ Schedule"],
        [notes, "n1", 0.8, "filed under Clients ▸ Dupont ▸ Schedule"],
      ]),
      contents: hits("contents", [
        [offer, "o3", 0.9, "under the heading “3. Schedule”"],
        [offer, "o4", 0.9, "under the heading “3. Schedule”"],
      ]),
    },
    rerank: { m2: 0.91, o3: 0.84, n1: 0.77, o4: 0.52, m4: 0.44 },
    threshold: 0.5,
  },
  {
    question: dupontBudget.question,
    expanded: expandedOf(dupontBudget),
    perIndex: {
      words: hits("words", [
        [offer, "o5", 0.5, "contains “total”"],
        [notes, "n2", 0.33, "contains “Dupont”"],
        [meeting, "m1", 0.33, "contains “Dupont”"],
      ]),
      meaning: hits("meaning", [
        [offer, "o5", 0.86, "close to “Dupont total price”"],
        [invoice, "i1", 0.61, "close to “Dupont budget”"],
        [meeting, "m1", 0.42, "close to “Dupont site foreman”"],
      ]),
      topics: hits("topics", [
        [offer, "o5", 0.8, "filed under Clients ▸ Dupont ▸ Price"],
        [invoice, "i1", 0.8, "filed under Clients ▸ Dupont ▸ Price"],
      ]),
      contents: hits("contents", [[offer, "o5", 0.9, "under the heading “4. Price”"]]),
    },
    rerank: { o5: 0.88, i1: 0.55, m1: 0.34, n2: 0.12 },
    threshold: 0.5,
  },
  {
    question: leroyTimber.question,
    expanded: expandedOf(leroyTimber),
    perIndex: {
      words: hits("words", [
        [leroy, "l1", 0.75, "contains “Leroy”, “roof”, “timber”"],
        [q3, "q2", 0.5, "contains “Leroy” (Leroy Merlin, a supplier)"],
      ]),
      meaning: hits("meaning", [
        [invoice, "i1", 0.57, "close to “Leroy timber invoice”"],
        [leroy, "l1", 0.55, "close to “cost of roof beams for Leroy”"],
        [offer, "o2", 0.49, "close to “cost of roof beams for Leroy”"],
      ]),
      topics: hits("topics", [
        [leroy, "l1", 0.8, "filed under Clients ▸ Leroy ▸ Roof timber"],
        [leroy, "l2", 0.8, "filed under Clients ▸ Leroy ▸ Roof timber"],
      ]),
      contents: [],
    },
    rerank: { l1: 0.38, i1: 0.31, q2: 0.22, o2: 0.18, l2: 0.15 },
    threshold: 0.5,
  },
];

export function traceFor(answer: GroundedAnswer): AnswerTrace | undefined {
  return traces.find((t) => t.question === answer.question);
}

/** The merged passages, rescored by the reranker and sorted by that score. */
export function reranked(trace: AnswerTrace): MergedResult[] {
  return mergeHits(trace.perIndex)
    .map((r) => {
      const score = trace.rerank[r.blockId] ?? 0;
      return { ...r, score, citation: r.citation && { ...r.citation, relevance: score } };
    })
    .sort((a, b) => b.score - a.score);
}

export interface UsedPassage {
  entry: MergedResult;
  /** The citation number in the answer. */
  n: number;
  /** The answer's sentences that cite it. */
  sentences: string[];
}

export interface UnusedPassage {
  entry: MergedResult;
  /** Below the threshold, or good enough but not needed by the answer. */
  reason: "below-threshold" | "not-needed";
}

/** Splits the reranked passages into the ones the answer cites and the rest. */
export function passages(trace: AnswerTrace, answer: GroundedAnswer) {
  const used: UsedPassage[] = [];
  const unused: UnusedPassage[] = [];
  for (const entry of reranked(trace)) {
    const source = answer.sources.find((s) => s.blockId === entry.blockId && s.path === entry.path);
    if (source) {
      const sentences = answer.segments.flatMap((s) =>
        "cites" in s && s.cites.includes(source.n) ? [s.text] : [],
      );
      used.push({ entry, n: source.n, sentences });
    } else
      unused.push({
        entry,
        reason: entry.score < trace.threshold ? "below-threshold" : "not-needed",
      });
  }
  return { used: used.sort((a, b) => a.n - b.n), unused };
}

/** Why nothing was found: what was searched, and the closest passage against the bar. */
export function notFoundReason(trace: AnswerTrace) {
  const all = reranked(trace);
  if (all.some((r) => r.score >= trace.threshold)) return null;
  return {
    searched: trace.expanded.map((q) => q.query),
    indexes: indexKinds.filter((k) => trace.perIndex[k].length > 0),
    found: all.length,
    closest: all[0],
    threshold: trace.threshold,
  };
}

/** The funnel: how many things survive each stage. */
export function funnel(trace: AnswerTrace, answer: GroundedAnswer) {
  const all = reranked(trace);
  return {
    queries: trace.expanded.length,
    hits: indexKinds.reduce((n, k) => n + trace.perIndex[k].length, 0),
    passages: all.length,
    qualified: all.filter((r) => r.score >= trace.threshold).length,
    cited: answer.sources.length,
  };
}
