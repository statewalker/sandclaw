#!/usr/bin/env tsx
/**
 * Stage 4 (selection) replay — re-run the lean retrieval with each recorded question's intent
 * subjects (hybrid search only: one query embedding per subject, no LLM call), apply every
 * selection variant to the SAME candidates, and report how much of the gold evidence each keeps.
 * Gold = the leaf sections holding the item's evidence quotes (`stage0-reachability.json`).
 *
 * usage: tsx eval/replay-select.ts <workspace-root> <project> <reachability.json>
 *          <baseline-run-dir> <out-dir>
 *
 * Writes <out-dir>/stage4-selection.{json,md}; prints `replay agreement` — the share of items
 * whose replayed `baseline` selection equals the recorded `keptSections` (the replay is only a
 * stand-in for the pipeline when this is high).
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NodeFilesApi } from "@statewalker/webrun-files-node";
import { type Logger, Workspace } from "@statewalker/workspace.core";
import {
  registerWiki,
  resolveProvidersFromEnv,
  SearchAdapter,
  wikiConfigOf,
} from "../src/index.js";
import type { Candidate, Subject } from "../src/query/fsm/query-context.js";
import { evidenceFor, hybridSearch, sectionId } from "../src/query/fsm/retrieval.js";
import { SELECT_TOP_N, selectSections } from "../src/query/fsm/select.js";

// `baseline` is the 13 October selection (top 20); the replay agreement is measured against it.
type Select = (cs: Candidate[]) => Candidate[];
const VARIANTS: { name: string; select: Select }[] = [
  { name: "baseline", select: (cs) => selectSections(cs, { topN: 20 }) },
  { name: "current", select: (cs) => selectSections(cs, { topN: SELECT_TOP_N }) },
  { name: "rrf@30", select: (cs) => selectSections(cs, { topN: 30 }) },
];

interface Recorded {
  id: string;
  trace: {
    calls: { name: string; output?: { subjects?: Subject[] } }[];
    logs: { msg: string; extra?: { keptSections?: string[] } }[];
  };
}
interface Row {
  id: string;
  category: string;
  variant: string;
  goldInPool: number;
  goldKept: number;
  kept: number;
}

const [root, projectKey, reachPath, runDir, outDir] = process.argv.slice(2);
if (!root || !projectKey || !reachPath || !runDir || !outDir) {
  console.error(
    "usage: replay-select.ts <workspace-root> <project> <reachability.json> <baseline-run-dir> <out-dir>",
  );
  process.exit(2);
}

const silent = (): void => {};
const log: Logger = {
  level: "fatal",
  fatal: silent,
  error: silent,
  warn: silent,
  info: silent,
  debug: silent,
  trace: silent,
  child: () => log,
};

const workspace = new Workspace().setFileSystem(new NodeFilesApi({ rootDir: root }));
await workspace.open();
registerWiki(workspace, { provider: resolveProvidersFromEnv(process.env).provider });
const project = await workspace.getProject(projectKey, false);
if (!project) throw new Error(`project not found: ${projectKey}`);
await wikiConfigOf(project).load(); // the search embedder reads the model config
const search = project.requireAdapter(SearchAdapter);

const reach = JSON.parse(await readFile(reachPath, "utf8")) as {
  rows: { id: string; category: string; document: string; sections: string[] }[];
};
const gold = new Map<string, { category: string; ids: Set<string> }>();
for (const r of reach.rows) {
  const g = gold.get(r.id) ?? { category: r.category, ids: new Set<string>() };
  for (const s of r.sections) g.ids.add(sectionId(r.document, s));
  gold.set(r.id, g);
}

const rows: Row[] = [];
let agreed = 0;
let replayed = 0;
const files = (await readdir(join(runDir, "answers"))).filter((f) => f.endsWith(".json")).sort();
for (const f of files) {
  const rec = JSON.parse(await readFile(join(runDir, "answers", f), "utf8")) as Recorded;
  const subjects = rec.trace.calls.find((c) => c.name === "intent-detection")?.output?.subjects;
  const g = gold.get(rec.id);
  if (!subjects?.length || !g?.ids.size) continue;

  // The lean candidate pool, rebuilt as LeanRetrieveTrigger does: best RRF score per section.
  const best = new Map<string, { uri: string; sectionKey: string; searchScore: number }>();
  for (const s of subjects) {
    for (const h of await hybridSearch(search, log, s)) {
      const id = sectionId(h.uri, h.sectionKey);
      const e = best.get(id) ?? { uri: h.uri, sectionKey: h.sectionKey, searchScore: 0 };
      e.searchScore = Math.max(e.searchScore, h.score);
      best.set(id, e);
    }
  }
  const candidates: Candidate[] = [];
  for (const e of best.values()) {
    const section = await evidenceFor(project, e.uri, e.sectionKey);
    if (!section) continue;
    candidates.push({ section, score: 1, searchScore: e.searchScore });
  }
  const idOf = (c: Candidate) => sectionId(c.section.uri, c.section.sectionKey);
  const pool = new Set(candidates.map(idOf));
  const goldInPool = [...g.ids].filter((id) => pool.has(id)).length;

  for (const v of VARIANTS) {
    const kept = v.select(candidates).map(idOf);
    const keptSet = new Set(kept);
    rows.push({
      id: rec.id,
      category: g.category,
      variant: v.name,
      goldInPool,
      goldKept: [...g.ids].filter((id) => keptSet.has(id)).length,
      kept: kept.length,
    });
    if (v.name === "baseline") {
      const recorded = rec.trace.logs.find((l) => l.msg === "selected sections")?.extra
        ?.keptSections;
      if (recorded) {
        replayed++;
        if (recorded.length === keptSet.size && recorded.every((id) => keptSet.has(id))) agreed++;
      }
    }
  }
  console.error(`${rec.id}: pool ${candidates.length}, gold in pool ${goldInPool}/${g.ids.size}`);
}

// retention = Σ goldKept / Σ goldInPool over items whose pool holds any gold.
function table(group: (r: Row) => string): string {
  const keys = [...new Set(rows.map(group))].sort();
  const lines = [
    `| group | ${VARIANTS.map((v) => v.name).join(" | ")} |`,
    `|---|${VARIANTS.map(() => "---").join("|")}|`,
  ];
  for (const k of keys) {
    const cells = VARIANTS.map((v) => {
      const rs = rows.filter((r) => r.variant === v.name && group(r) === k && r.goldInPool > 0);
      const inPool = rs.reduce((s, r) => s + r.goldInPool, 0);
      const kept = rs.reduce((s, r) => s + r.goldKept, 0);
      const full = rs.filter((r) => r.goldKept === r.goldInPool).length;
      const mean = rs.reduce((s, r) => s + r.kept, 0) / Math.max(1, rs.length);
      return `${((100 * kept) / Math.max(1, inPool)).toFixed(1)} % (${full}/${rs.length} full, ${mean.toFixed(0)} kept)`;
    });
    lines.push(`| ${k} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

const agreement = replayed ? agreed / replayed : 0;
const md = `# Stage 4 — selection replay

Run replayed: \`${runDir}\`. Retention = gold sections kept / gold sections in the candidate pool
(items whose pool holds any gold). Each cell: retention (items keeping all their pooled gold, mean
sections kept).

Replay agreement with the recorded baseline selection: **${(100 * agreement).toFixed(1)} %**
(${agreed}/${replayed} items).

## Overall

${table(() => "all")}

## By category

${table((r) => r.category)}
`;
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "stage4-selection.json"), `${JSON.stringify(rows, null, 2)}\n`);
await writeFile(join(outDir, "stage4-selection.md"), md);
console.log(`replay agreement: ${agreement.toFixed(3)} (${agreed}/${replayed})`);
console.log(table(() => "all"));
