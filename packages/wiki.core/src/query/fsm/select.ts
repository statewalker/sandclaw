import type { Candidate } from "./query-context.js";

/** Cap on the rank-based pre-filter: keep at most this many top-scored single-front-end sections. */
export const SELECT_TOP_N = 20;

const RRF_K = 60;

export interface SelectOptions {
  topN: number;
  /** When set, rank by search rank boosted (up to ×2) by the share of query terms each section contains. */
  coverage?: { terms: string[]; textOf: (c: Candidate) => string };
}

/** Case- and accent-insensitive form for term matching (accented sources, unaccented terms). */
function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
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
  const bySearch = candidates
    .filter((c) => c.score < 2)
    .sort((a, b) => b.searchScore - a.searchScore);
  const terms = [...new Set((opts.coverage?.terms ?? []).map(fold))];
  let ranked = bySearch;
  if (opts.coverage && terms.length > 0) {
    const { textOf } = opts.coverage;
    // The search-rank score 1/(k + rank), scaled by up to ×2 for the share of query terms the
    // section contains. Equal-weight RRF of two ranks cannot lift a section past one that is a
    // single place ahead (the scores tie); this boost can, without discarding the search order
    // the way a coverage-only sort does.
    const boosted = new Map(
      bySearch.map((c, i) => {
        const text = fold(`${c.section.title}\n${textOf(c)}`);
        const hits = terms.filter((t) => text.includes(t)).length;
        return [c, (1 + hits / terms.length) / (RRF_K + i)];
      }),
    );
    // Stable sort: ties keep the search-score order.
    ranked = [...bySearch].sort((a, b) => (boosted.get(b) ?? 0) - (boosted.get(a) ?? 0));
  }
  return [...trusted, ...ranked.slice(0, opts.topN)];
}
