#!/usr/bin/env tsx
/**
 * Stage 0 (transformation) — can the built wiki reach each gold evidence quote at all?
 * For every evidence quote: is it in the page's extracted `raw.txt`, and is it inside
 * some leaf section's line range (the only text search and answering ever read)?
 *
 * usage: tsx eval/reachability.ts <project-dir> <questions.json> <out.json>
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findQuoteLines, findQuoteTokenLines } from "./lib.js";

interface SummaryNode {
  key: string;
  startLine: number;
  endLine: number;
  children?: SummaryNode[];
}
interface Evidence {
  document: string;
  pages: number[];
  quote: string;
  image_only?: boolean;
}
interface Item {
  id: string;
  category: string;
  evidence: Evidence[];
}

function leaves(n: SummaryNode): SummaryNode[] {
  return n.children?.length ? n.children.flatMap(leaves) : [n];
}

const [projectDir, questionsPath, outPath] = process.argv.slice(2);
if (!projectDir || !questionsPath || !outPath) {
  console.error("usage: reachability.ts <project-dir> <questions.json> <out.json>");
  process.exit(2);
}
const items = JSON.parse(await readFile(questionsPath, "utf8")) as Item[];
const pageDir = (doc: string) => join(projectDir, ".project", "pages", doc);

const cache = new Map<string, { raw: string; leaves: SummaryNode[] } | null>();
async function load(doc: string) {
  if (!cache.has(doc)) {
    try {
      const raw = await readFile(join(pageDir(doc), "raw.txt"), "utf8");
      const summary = JSON.parse(await readFile(join(pageDir(doc), "summary.json"), "utf8"));
      cache.set(doc, { raw, leaves: leaves(summary) });
    } catch {
      cache.set(doc, null);
    }
  }
  return cache.get(doc) ?? null;
}

type Status = "in-section" | "outside-sections" | "not-extracted" | "document-missing";
const rows: {
  id: string;
  category: string;
  document: string;
  status: Status;
  sections: string[];
}[] = [];
for (const it of items) {
  for (const ev of it.evidence) {
    if (ev.document.endsWith(".xlsx")) continue; // cell refs, not quotes
    const doc = await load(ev.document);
    let status: Status = "document-missing";
    let sections: string[] = [];
    if (doc) {
      // An elided quote is reachable when every part is. Exact match first; then the
      // token fallback on the cited pages (reordered table cells / slide columns).
      const parts = ev.quote.split(/\.\.\.|…/).filter((p) => p.replace(/\s/g, "").length > 8);
      const lineSets = parts.map((p) => {
        const span = findQuoteLines(doc.raw, p);
        if (span)
          return Array.from({ length: span.end - span.start + 1 }, (_, i) => span.start + i);
        return findQuoteTokenLines(doc.raw, p, ev.pages);
      });
      if (lineSets.some((s) => !s)) status = "not-extracted";
      else {
        const needed = [...new Set(lineSets.flatMap((s) => s ?? []))];
        const covering = (line: number) =>
          doc.leaves.filter((l) => line >= l.startLine && line <= l.endLine).map((l) => l.key);
        sections = [...new Set(needed.flatMap(covering))];
        status = needed.every((line) => covering(line).length > 0)
          ? "in-section"
          : "outside-sections";
      }
    }
    rows.push({ id: it.id, category: it.category, document: ev.document, status, sections });
  }
}

const count = (s: Status) => rows.filter((r) => r.status === s).length;
const itemOk = new Map<string, boolean>();
for (const r of rows) itemOk.set(r.id, (itemOk.get(r.id) ?? true) && r.status === "in-section");
const summary = {
  quotes: rows.length,
  inSection: count("in-section"),
  outsideSections: count("outside-sections"),
  notExtracted: count("not-extracted"),
  documentMissing: count("document-missing"),
  itemsFullyReachable: [...itemOk.values()].filter(Boolean).length,
  itemsWithQuotes: itemOk.size,
};
await writeFile(outPath, `${JSON.stringify({ summary, rows }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
