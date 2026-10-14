import type { Candidate } from "./query-context.js";

/**
 * Cap on the rank-based pre-filter: keep at most this many top-scored single-front-end sections.
 * 40, not 20: replaying the evaluation set's recorded intents, the top 20 of ~100 hybrid-search
 * candidates keeps 71 % of the gold sections the search found, the top 40 keeps 86 %. The extra
 * 20 sections cost about $0.013 per query in rolling-summarize calls. Ranking by query-term
 * coverage of the raw text as well gained about one point more and was not kept.
 */
export const SELECT_TOP_N = 40;

export interface SelectOptions {
  topN: number;
}

/**
 * Mechanical, rank-based relevance pre-filter that narrows the retrieved candidates BEFORE the
 * expensive raw-content rolling summarization — WITHOUT an LLM summary filter.
 *
 * Sections surfaced by BOTH front-ends (hybrid search AND the topic ladder, `score >= 2`) are
 * kept unconditionally: their dual agreement is a strong signal. The single-front-end remainder is
 * ranked by its hybrid-search RRF score and the top `topN` kept. Ranking on the search score (NOT a
 * model re-reading the summary) is what keeps the answer section: full-text search indexes the RAW
 * content, so a section whose summary omits the queried entity/figure still scores — whereas a
 * summary-based LLM filter drops exactly those.
 */
export function selectSections(candidates: Candidate[], opts: SelectOptions): Candidate[] {
  const trusted = candidates.filter((c) => c.score >= 2);
  const ranked = candidates
    .filter((c) => c.score < 2)
    .sort((a, b) => b.searchScore - a.searchScore)
    .slice(0, opts.topN);
  return [...trusted, ...ranked];
}
