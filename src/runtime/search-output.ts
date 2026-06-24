import type { DocumentMatch } from "../search/index.js";

/** Verbosity of the `search` command's grouped-by-document output. */
export type SearchDetail = "short" | "normal" | "full";

/** A section's display metadata, resolved from its page summary/meta artifacts. */
export interface SectionInfo {
  title: string;
  summary: string;
  topics: string[];
}

/** Resolves a section's display metadata. Only called for `normal`/`full` detail. */
export type SectionInfoLookup = (uri: string, sectionKey: string) => SectionInfo;

/** A matched section, shaped for output. `summary`/`topics` are present only at `full`. */
export interface SectionOut {
  sectionKey: string;
  title: string;
  score: number;
  modes: ("fts" | "vector")[];
  summary?: string;
  topics?: string[];
}

/** `short` detail: a document with its matched-section count. */
export interface ShortDoc {
  uri: string;
  score: number;
  sections: number;
}

/** `normal`/`full` detail: a document with its matched sections. */
export interface DetailedDoc {
  uri: string;
  score: number;
  sections: SectionOut[];
}

export type SearchDoc = ShortDoc | DetailedDoc;

/**
 * Shape hybrid-search `DocumentMatch`es into the grouped-by-document output for the
 * requested verbosity. Documents are ordered by their best section score (descending),
 * and within a document the sections are ordered the same way.
 *
 * - `short`  — `{ uri, score, sections: <count> }`
 * - `normal` — sections as `{ sectionKey, title, score, modes }`
 * - `full`   — sections additionally carry `summary` and `topics`
 *
 * `info` supplies each section's title (and summary/topics for `full`); it is not
 * consulted at `short`. Missing metadata falls back to the section key / empty values.
 */
export function buildSearchDocuments(
  matches: DocumentMatch[],
  detail: SearchDetail,
  info?: SectionInfoLookup,
): SearchDoc[] {
  const ranked = matches
    .map((match) => ({
      match,
      score: match.sections.reduce((max, s) => Math.max(max, s.score), 0),
    }))
    .sort((a, b) => b.score - a.score);

  if (detail === "short") {
    return ranked.map(({ match, score }) => ({
      uri: match.uri,
      score,
      sections: match.sections.length,
    }));
  }

  return ranked.map(({ match, score }) => ({
    uri: match.uri,
    score,
    sections: [...match.sections]
      .sort((a, b) => b.score - a.score)
      .map((s) => {
        const meta = info?.(match.uri, s.sectionKey);
        const out: SectionOut = {
          sectionKey: s.sectionKey,
          title: meta?.title ?? s.sectionKey,
          score: s.score,
          modes: s.modes,
        };
        if (detail === "full") {
          out.summary = meta?.summary ?? "";
          out.topics = meta?.topics ?? [];
        }
        return out;
      }),
  }));
}

/** Render the shaped documents as human-readable lines for the diagnostics channel. */
export function renderSearchDocuments(documents: SearchDoc[], detail: SearchDetail): string[] {
  const lines: string[] = [];
  for (const doc of documents) {
    if (detail === "short") {
      lines.push(`  ${doc.uri}  —  ${(doc as ShortDoc).sections} section(s)`);
      continue;
    }
    lines.push(`  ${doc.uri}`);
    for (const s of (doc as DetailedDoc).sections) {
      lines.push(`    [${s.score.toFixed(3)}] ${s.sectionKey}  ${s.title}`);
      if (detail === "full") {
        if (s.topics?.length) lines.push(`      topics: ${s.topics.join(", ")}`);
        if (s.summary) lines.push(`      ${s.summary}`);
      }
    }
  }
  return lines;
}
