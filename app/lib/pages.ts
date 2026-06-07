/**
 * Pure helpers shared by the data layer and the UI. No filesystem access here —
 * everything is unit-tested in `__tests__/pages.test.ts`.
 */

/**
 * Reduce any citation URI to the bare `file#anchor` form the viewer uses. A
 * canonical `wiki://<key>/<path>#<section>` reference (as emitted by the query
 * adapter) has its scheme + key authority stripped; a bare URI is returned as-is.
 */
export function bareUri(uri: string): string {
  let s = uri.trim();
  if (s.startsWith("wiki://")) {
    const rest = s.slice("wiki://".length);
    const slash = rest.indexOf("/");
    s = slash === -1 ? rest : rest.slice(slash + 1);
  }
  return s;
}

/** Rewrite every `[[…]]` citation marker in prose to the bare `file#anchor` form. */
export function rewriteCitations(text: string): string {
  return text.replace(
    /\[\[([^\]]+)\]\]/g,
    (_m, inner) => `[[${bareUri(inner)}]]`,
  );
}

/** Split a citation URI `file.pdf#anchor` (or a `wiki://…` reference) into its parts. */
export function parseCitationUri(uri: string): {
  file: string;
  anchor: string;
} {
  const cleaned = bareUri(uri);
  const hash = cleaned.indexOf("#");
  if (hash === -1) return { file: cleaned, anchor: "" };
  return { file: cleaned.slice(0, hash), anchor: cleaned.slice(hash + 1) };
}

export type Segment =
  | { type: "text"; value: string }
  | { type: "cite"; value: string };

/**
 * Split section prose into plain-text runs and `[[...]]` citation tokens.
 * Used by the renderer to interleave clickable citation chips.
 */
export function splitCitations(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const idx = m.index;
    if (idx > last) {
      segments.push({ type: "text", value: text.slice(last, idx) });
    }
    segments.push({ type: "cite", value: m[1].trim() });
    last = idx + m[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  return segments;
}

/**
 * Unique citation URIs in the order a reader meets them: first appearance in
 * the prose, then any from `extra` (the section's flat citation list) not
 * already seen. This is the canonical numbering used by chips and the
 * citations list.
 */
export function orderedCitationUris(
  text: string,
  extra: string[] = [],
): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const uri = m[1].trim();
    if (!seen.has(uri)) {
      seen.add(uri);
      order.push(uri);
    }
  }
  for (const uri of extra) {
    const u = uri.trim();
    if (u && !seen.has(u)) {
      seen.add(u);
      order.push(u);
    }
  }
  return order;
}

/**
 * Re-flow generated prose into Markdown: promote every single newline to a
 * paragraph break (`\n\n`) so single-line breaks render as separate paragraphs
 * / list blocks. GFM table blocks are the exception — their rows are separated
 * by single newlines, so a blanket collapse would shatter a table into one
 * paragraph per row. Such blocks are detected (a pipe-bearing header line
 * immediately followed by a `| --- | --- |` delimiter row) and kept intact.
 */
export function promoteParagraphs(text: string): string {
  const lines = text.split("\n");
  // A GFM delimiter row: only pipes, dashes, colons and whitespace, with at
  // least one of each of a pipe and a dash (rules out `---` horizontal rules).
  const isDelimiter = (l: string) =>
    /\|/.test(l) && /-/.test(l) && /^[\s|:-]+$/.test(l);

  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Table: a pipe-bearing line followed by a delimiter row. Consume the
    // header, the delimiter, and every following pipe-bearing body row.
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isDelimiter(lines[i + 1])
    ) {
      const table = [line, lines[i + 1]];
      i += 2;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        lines[i].includes("|")
      ) {
        table.push(lines[i]);
        i++;
      }
      blocks.push(table.join("\n"));
      continue;
    }
    // Ordinary line: blanks are dropped (they become paragraph separators),
    // every other line becomes its own paragraph block.
    if (line.trim() !== "") blocks.push(line);
    i++;
  }
  return blocks.join("\n\n");
}

/**
 * Map a raw-text line index to the 1-based PDF page it falls on, by counting
 * `## Page N` markers at or before `startLine`. Returns 1 when there are no
 * markers before the line.
 */
export function sectionToPdfPage(rawTxt: string, startLine: number): number {
  const lines = rawTxt.split("\n");
  const upto = Math.min(startLine, lines.length - 1);
  const marker = /^## Page \d+/;
  let page = 0;
  for (let i = 0; i <= upto; i++) {
    if (marker.test(lines[i])) page++;
  }
  return page > 0 ? page : 1;
}
