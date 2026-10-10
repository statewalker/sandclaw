// The Markdown subset a note uses: headings, paragraphs, lists with todo items
// (`- [ ]`), fenced code, tables, rules; inline bold, italic, code and links.
// Every block keeps the source lines it came from, so the preview can tick a
// todo, or open the source at the line clicked, without re-serialising anything.

/** Inline content of a heading, paragraph, list item or table cell. */
export type Inline =
  | string
  | { kind: "strong" | "em"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] };

export interface ListItem {
  /** The source line of the item. */
  line: number;
  text: string;
  /** Present for todo items (`- [ ]`, `- [x]`). */
  done?: boolean;
}

/** A block spans source lines `[line, end)`. */
export type Block = { line: number; end: number } & (
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "code"; lang: string; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "rule" }
);

const heading = /^(#{1,6})\s+(.*)$/;
const item = /^\s*([-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/;
const fence = /^\s*```(.*)$/;
const rule = /^\s*([-*_])(\s*\1){2,}\s*$/;
const tableSeparator = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

const isTableStart = (lines: string[], i: number) =>
  (lines[i] ?? "").trim().startsWith("|") && tableSeparator.test(lines[i + 1] ?? "");

/** The blocks of `text`, in source order. */
export function parseMarkdown(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const start = i;
    if (!line.trim()) {
      i++;
      continue;
    }
    const f = fence.exec(line);
    if (f) {
      i++;
      while (i < lines.length && !fence.test(lines[i] ?? "")) i++;
      const body = lines.slice(start + 1, i).join("\n");
      i = Math.min(i + 1, lines.length);
      blocks.push({ kind: "code", lang: (f[1] ?? "").trim(), text: body, line: start, end: i });
      continue;
    }
    const h = heading.exec(line);
    if (h) {
      const level = h[1]?.length ?? 1;
      blocks.push({ kind: "heading", level, text: h[2] ?? "", line: start, end: ++i });
      continue;
    }
    if (rule.test(line)) {
      blocks.push({ kind: "rule", line: start, end: ++i });
      continue;
    }
    if (isTableStart(lines, i)) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|"))
        rows.push(cells(lines[i++] ?? ""));
      blocks.push({ kind: "table", head, rows, line: start, end: i });
      continue;
    }
    if (item.test(line)) {
      const isOrdered = (l: string) => /^\s*\d/.test(l);
      const ordered = isOrdered(line);
      const items: ListItem[] = [];
      const next = () => {
        const l = lines[i] ?? "";
        return isOrdered(l) === ordered ? item.exec(l) : null;
      };
      for (let m = next(); m; m = next()) {
        const done = m[2] === undefined ? undefined : m[2] !== " ";
        items.push({ line: i, text: m[3] ?? "", ...(done === undefined ? {} : { done }) });
        i++;
      }
      blocks.push({ kind: "list", ordered, items, line: start, end: i });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (!l.trim() || heading.test(l) || fence.test(l) || item.test(l) || isTableStart(lines, i))
        break;
      para.push(l.trim());
      i++;
    }
    blocks.push({ kind: "paragraph", text: para.join(" "), line: start, end: i });
  }
  return blocks;
}

const inlineToken = /`([^`]+)`|\*\*(.+?)\*\*|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\(([^)]+)\)/;

/** Bold, italic, inline code and links in `text`; the rest stays plain text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  for (let m = inlineToken.exec(rest); m; m = inlineToken.exec(rest)) {
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[1] !== undefined) out.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "strong", children: parseInline(m[2]) });
    else if (m[3] !== undefined || m[4] !== undefined)
      out.push({ kind: "em", children: parseInline(m[3] ?? m[4] ?? "") });
    else out.push({ kind: "link", href: m[6] ?? "", children: parseInline(m[5] ?? "") });
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push(rest);
  return out;
}

/** `text` with lines `[from, to)` replaced by `replacement` (itself possibly several lines). */
export function replaceLines(text: string, from: number, to: number, replacement: string): string {
  const lines = text.split("\n");
  lines.splice(from, to - from, ...replacement.split("\n"));
  return lines.join("\n");
}

/** Character offset where `line` starts, to put the caret there. */
export function lineOffset(text: string, line: number): number {
  return text
    .split("\n")
    .slice(0, line)
    .reduce((n, l) => n + l.length + 1, 0);
}
