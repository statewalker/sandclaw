/**
 * Page-level evaluation helpers. The evaluation set cites evidence as
 * (document, physical PDF page); the wiki cites (document, section). These map
 * one onto the other through the `## Page N` markers the PDF extractor writes
 * into each page's `raw.txt`.
 */

/** Evidence or retrieval at page granularity. `pages: []` = the whole document (workbooks). */
export interface PageRef {
  document: string;
  pages: number[];
}

const PAGE_MARKER = /^## Page (\d+)\s*$/;

/** The 1-based pages a 0-based inclusive line range spans; `[]` when the text has no page markers. */
export function linePages(raw: string, startLine: number, endLine: number): number[] {
  const lines = raw.split("\n");
  let page = 0;
  const pages = new Set<number>();
  for (let i = 0; i < lines.length && i <= endLine; i++) {
    const m = lines[i]?.match(PAGE_MARKER);
    if (m) page = Number(m[1]);
    if (i >= startLine && page > 0) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

function fold(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .toLowerCase();
}

/**
 * The line range holding `quote` in `raw`, comparing without whitespace, case or
 * typographic quotes (extractors break lines and collapse spaces differently).
 */
export function findQuoteLines(
  raw: string,
  quote: string,
): { start: number; end: number } | undefined {
  const lineOf: number[] = [];
  let text = "";
  raw.split("\n").forEach((line, i) => {
    for (const ch of fold(line)) {
      if (/\s/.test(ch)) continue;
      text += ch;
      lineOf.push(i);
    }
  });
  const needle = fold(quote).replace(/\s+/g, "");
  if (!needle) return undefined;
  const at = text.indexOf(needle);
  if (at < 0) return undefined;
  return { start: lineOf[at] as number, end: lineOf[at + needle.length - 1] as number };
}

/**
 * Fallback for quotes from tables and multi-column slides, whose cells another
 * extractor emits in a different order: the lines on `pages` that hold each token
 * of the quote (first occurrence per token), or `undefined` when a token is absent.
 */
export function findQuoteTokenLines(
  raw: string,
  quote: string,
  pages: number[],
): number[] | undefined {
  const lines = raw.split("\n");
  const onPages: number[] = [];
  let page = 0;
  lines.forEach((line, i) => {
    const m = line.match(PAGE_MARKER);
    if (m) page = Number(m[1]);
    else if (pages.includes(page)) onPages.push(i);
  });
  const tokens = fold(quote).match(/[\p{L}\p{N}][\p{L}\p{N}.,%€']*/gu) ?? [];
  const found = new Set<number>();
  for (const t of tokens) {
    const at = onPages.find((i) => fold(lines[i] ?? "").includes(t));
    if (at === undefined) return undefined;
    found.add(at);
  }
  return found.size > 0 ? [...found].sort((a, b) => a - b) : undefined;
}

/**
 * Share of gold (document, page) pairs that `got` covers, and share of gold documents
 * touched. A gold ref with no pages (a workbook) counts as one pair hit by any ref to
 * that document. `undefined` when there is no gold evidence (negative items).
 */
export function pageRecall(
  gold: PageRef[],
  got: PageRef[],
): { pages: number; documents: number } | undefined {
  const gotPages = new Map<string, Set<number>>();
  for (const g of got) {
    const set = gotPages.get(g.document) ?? new Set<number>();
    for (const p of g.pages) set.add(p);
    gotPages.set(g.document, set);
  }
  const pairs = new Set<string>();
  const docs = new Set<string>();
  for (const g of gold) {
    docs.add(g.document);
    if (g.pages.length === 0) pairs.add(`${g.document}\u0000*`);
    for (const p of g.pages) pairs.add(`${g.document}\u0000${p}`);
  }
  if (pairs.size === 0) return undefined;
  let hit = 0;
  for (const pair of pairs) {
    const [doc, page] = pair.split("\u0000") as [string, string];
    const set = gotPages.get(doc);
    if (set && (page === "*" || set.has(Number(page)))) hit++;
  }
  const docHit = [...docs].filter((d) => gotPages.has(d)).length;
  return { pages: hit / pairs.size, documents: docHit / docs.size };
}
