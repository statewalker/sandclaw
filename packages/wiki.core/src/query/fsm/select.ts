import type { Candidate } from "./query-context.js";

/**
 * Cap on the rank-based pre-filter: keep at most this many top-scored single-front-end sections.
 * Measured on an evaluation set, a wider cut (40) reached more of the evidence but did not improve
 * answers: the answer step drops facts as its input grows, and cost and latency rose with it.
 * Choose better sections ({@link RERANK_POOL}) rather than more of them.
 */
export const SELECT_TOP_N = 20;

export interface SelectOptions {
  topN: number;
  /** Indices into the single-front-end candidates ranked by search score, most useful first.
   * Picked sections lead; the rest of `topN` is filled in search order. */
  picks?: number[];
}

/** The single-front-end candidates in search-score order — the list `picks` indexes. */
export function rankBySearch(candidates: Candidate[]): Candidate[] {
  return candidates.filter((c) => c.score < 2).sort((a, b) => b.searchScore - a.searchScore);
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
 *
 * `picks` (an LLM's choice from the top of that ranking) reorder the cut, they do not replace or
 * widen it: a wider cut dilutes the answer step, and a cheap model returns only a handful of picks,
 * so the remaining slots are filled in search order.
 */
export function selectSections(candidates: Candidate[], opts: SelectOptions): Candidate[] {
  const trusted = candidates.filter((c) => c.score >= 2);
  const ranked = rankBySearch(candidates);
  const picked = new Set<Candidate>();
  for (const i of opts.picks ?? []) {
    const c = Number.isInteger(i) ? ranked[i] : undefined;
    if (c) picked.add(c);
  }
  const ordered = [...picked, ...ranked.filter((c) => !picked.has(c))];
  return [...trusted, ...ordered.slice(0, opts.topN)];
}
