#!/usr/bin/env tsx
/**
 * Score a run (eval/run.ts output) against the evaluation set.
 *
 * Per question: page recall at each pipeline stage (search hits → selected →
 * summarized/kept → cited), and an LLM judgement of the answer against the item's
 * `key_facts` (plus refusal / divergence / wrong-entity checks). Judgements are cached
 * in <run-dir>/judgements/, so re-scoring is free.
 *
 * usage: tsx eval/score.ts <project-dir> <questions.json> <run-dir> [--judge <model>]
 * Writes <run-dir>/scores.json and <run-dir>/report.md.
 */
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateObject } from "ai";
import { z } from "zod";
import { costOf, resolveProvidersFromEnv } from "../src/index.js";
import { linePages, type PageRef, pageRecall } from "./lib.js";

interface Item {
  id: string;
  cluster: string;
  category: string;
  difficulty: number;
  question: string;
  expected_answer: string;
  key_facts: string[];
  evidence: { document: string; pages: number[]; image_only?: boolean }[];
}
interface RunRecord {
  id: string;
  mode: string;
  answer?: { text: string; citations: string[]; caveats: string[]; evidenceCount: number };
  error?: string;
  stats: { ms: number; usd: number; calls: number; queryKind?: string; escalated?: boolean };
  trace: { logs: { msg: string; extra?: Record<string, unknown> }[] };
}

const args = process.argv.slice(2);
const judgeIdx = args.indexOf("--judge");
const judgeModel =
  judgeIdx >= 0
    ? (args.splice(judgeIdx, 2)[1] as string)
    : (process.env.WIKI_JUDGE_MODEL ?? "openai/gpt-4.1");
const [projectDir, questionsPath, runDir] = args;
if (!projectDir || !questionsPath || !runDir) {
  console.error("usage: score.ts <project-dir> <questions.json> <run-dir> [--judge <model>]");
  process.exit(2);
}

// ---- section ref → pages -------------------------------------------------------------

interface SummaryNode {
  key: string;
  startLine: number;
  endLine: number;
  children?: SummaryNode[];
}
const docCache = new Map<string, { raw: string; leaves: Map<string, SummaryNode> } | null>();
async function loadDoc(doc: string) {
  if (!docCache.has(doc)) {
    const dir = join(projectDir as string, ".project", "pages", doc);
    try {
      const raw = await readFile(join(dir, "raw.txt"), "utf8");
      const leaves = new Map<string, SummaryNode>();
      const walk = (n: SummaryNode): void => {
        if (n.children?.length) n.children.forEach(walk);
        else leaves.set(n.key, n);
      };
      walk(JSON.parse(await readFile(join(dir, "summary.json"), "utf8")));
      docCache.set(doc, { raw, leaves });
    } catch {
      docCache.set(doc, null);
    }
  }
  return docCache.get(doc) ?? null;
}

/** `/doc.pdf#key`, `[[/doc.pdf#key]]`, `doc.pdf#key` → { document, section }. */
function parseRef(ref: string): { document: string; section: string } | undefined {
  const s = ref
    .replace(/^\[\[|\]\]$/g, "")
    .replace(/^wiki:\/\/[^/]+\//, "")
    .replace(/^\//, "");
  const at = s.lastIndexOf("#");
  if (at < 0) return undefined;
  return { document: decodeURIComponent(s.slice(0, at)), section: s.slice(at + 1) };
}

async function refsToPages(refs: Iterable<string>): Promise<PageRef[]> {
  const out: PageRef[] = [];
  for (const ref of new Set(refs)) {
    const p = parseRef(ref);
    if (!p) continue;
    const doc = await loadDoc(p.document);
    const leaf = doc?.leaves.get(p.section);
    out.push({
      document: p.document,
      pages: doc && leaf ? linePages(doc.raw, leaf.startLine, leaf.endLine) : [],
    });
  }
  return out;
}

/** The section refs each stage touched, read from the run's structured query logs. */
function stageRefs(rec: RunRecord) {
  const search = new Set<string>();
  const retrieved = new Set<string>();
  const selected = new Set<string>();
  let kept: string[] = [];
  for (const l of rec.trace.logs) {
    const x = l.extra ?? {};
    if (l.msg === "hybrid search") {
      for (const s of [
        ...((x.ftsSections as string[]) ?? []),
        ...((x.vectorSections as string[]) ?? []),
      ]) {
        search.add(s);
        retrieved.add(s);
      }
    } else if (l.msg === "retrieved evidence") {
      // sectionsPerDoc: [["<n>× <uri>", key, key…], …] — includes the topic-ladder front-end.
      for (const group of (x.sectionsPerDoc as string[][]) ?? []) {
        const uri = (group[0] ?? "").replace(/^\d+× /, "");
        for (const key of group.slice(1)) retrieved.add(`${uri}#${key}`);
      }
    } else if (l.msg === "selected sections") {
      for (const s of (x.keptSections as string[]) ?? []) selected.add(s);
    } else if (l.msg === "rolling summaries") {
      kept = (x.keptSections as string[]) ?? kept;
    }
  }
  return {
    search,
    retrieved,
    selected,
    kept: new Set(kept),
    cited: new Set(rec.answer?.citations ?? []),
  };
}

// ---- answer judge ----------------------------------------------------------------------

const judgementSchema = z.object({
  facts: z.array(
    z.object({
      fact: z.string(),
      verdict: z.enum(["present", "partial", "absent", "contradicted"]),
    }),
  ),
  statesAbsence: z
    .boolean()
    .describe("The answer says (some of) the requested information is not in the documents."),
  wrongEntity: z
    .boolean()
    .describe(
      "The answer presents a fact about a different entity, date or period as the answer.",
    ),
  divergenceSurfaced: z
    .boolean()
    .describe(
      "The answer names more than one differing value for the same quantity, each with its qualifier.",
    ),
  comment: z.string().describe("One sentence: the main defect, or 'ok'."),
});
type Judgement = z.infer<typeof judgementSchema> & { usd: number };

const JUDGE_SYSTEM = `You grade an answer produced by a document question-answering system against a
reference. You receive the question, the reference answer, the KEY FACTS a correct answer must state,
and the system's answer. For EACH key fact, in order, return a verdict:
- present: the answer states it (wording, rounding and number formatting may differ: 308 200 = 308,200 = 308.2k);
- partial: the answer states part of it, or states it without the qualifier the fact carries (date, entity, unit);
- absent: the answer does not state it;
- contradicted: the answer states a different value or claim for the same thing.
Then the three flags. Judge only against the reference; do not use outside knowledge. Ignore citation
markup like [[/doc#section]].`;

const providers = resolveProvidersFromEnv(process.env);
async function judge(item: Item, answerText: string): Promise<Judgement> {
  const { object, usage } = await generateObject({
    model: providers.provider.languageModel(judgeModel),
    system: JUDGE_SYSTEM,
    schema: judgementSchema,
    prompt: JSON.stringify(
      {
        question: item.question,
        reference: item.expected_answer,
        keyFacts: item.key_facts,
        answer: answerText,
      },
      null,
      2,
    ),
  });
  const cost = costOf(judgeModel, {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  });
  return { ...object, usd: cost.totalUsd };
}

// ---- main ------------------------------------------------------------------------------

const items = JSON.parse(await readFile(questionsPath, "utf8")) as Item[];
const byId = new Map(items.map((i) => [i.id, i]));
const judgeDir = join(runDir, "judgements");
await mkdir(judgeDir, { recursive: true });
const files = (await readdir(join(runDir, "answers"))).filter((f) => f.endsWith(".json"));

const FACT_SCORE = { present: 1, partial: 0.5, absent: 0, contradicted: 0 } as const;
type Recall = { pages: number; documents: number } | undefined;
interface Row {
  id: string;
  cluster: string;
  category: string;
  difficulty: number;
  needsOcr: boolean;
  error?: string;
  factScore: number;
  contradicted: number;
  negativeOk?: boolean;
  divergenceOk?: boolean;
  wrongEntity: boolean;
  recall: Record<"search" | "retrieved" | "selected" | "kept" | "cited", Recall>;
  citedPages: number;
  queryKind?: string;
  escalated?: boolean;
  ms: number;
  usd: number;
  judgeUsd: number;
  comment?: string;
}
const rows: Row[] = [];
for (const f of files.sort()) {
  const rec = JSON.parse(await readFile(join(runDir, "answers", f), "utf8")) as RunRecord;
  const item = byId.get(rec.id);
  if (!item) continue;
  const gold: PageRef[] = item.evidence.map((e) => ({ document: e.document, pages: e.pages }));
  const st = stageRefs(rec);
  const recall = {
    search: pageRecall(gold, await refsToPages(st.search)),
    retrieved: pageRecall(gold, await refsToPages(st.retrieved)),
    selected: pageRecall(gold, await refsToPages(st.selected)),
    kept: pageRecall(gold, await refsToPages(st.kept)),
    cited: pageRecall(gold, await refsToPages(st.cited)),
  };
  const jf = join(judgeDir, f);
  let j: Judgement | undefined;
  if (await stat(jf).catch(() => null)) j = JSON.parse(await readFile(jf, "utf8"));
  else if (rec.answer) {
    j = await judge(item, rec.answer.text);
    await writeFile(jf, `${JSON.stringify(j, null, 2)}\n`);
  }
  const factScore = j
    ? j.facts.reduce((s, x) => s + FACT_SCORE[x.verdict], 0) / Math.max(1, item.key_facts.length)
    : 0;
  const isNegative = item.category === "negative";
  rows.push({
    id: item.id,
    cluster: item.cluster,
    category: item.category,
    difficulty: item.difficulty,
    needsOcr: item.evidence.some((e) => e.image_only),
    error: rec.error,
    factScore,
    contradicted: j?.facts.filter((x) => x.verdict === "contradicted").length ?? 0,
    // A negative item is correct when the answer states absence and substitutes nothing.
    negativeOk: isNegative ? Boolean(j?.statesAbsence && !j?.wrongEntity) : undefined,
    divergenceOk: item.category === "conflict" ? Boolean(j?.divergenceSurfaced) : undefined,
    wrongEntity: Boolean(j?.wrongEntity),
    recall,
    citedPages: (await refsToPages(st.cited)).length,
    queryKind: rec.stats.queryKind,
    escalated: rec.stats.escalated,
    ms: rec.stats.ms,
    usd: rec.stats.usd,
    judgeUsd: j?.usd ?? 0,
    comment: j?.comment,
  });
}

// ---- aggregate -------------------------------------------------------------------------

const mean = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};
const pct = (x: number | undefined) => (x === undefined ? "–" : `${(x * 100).toFixed(0)}%`);
const bool = (xs: (boolean | undefined)[]) =>
  mean(xs.filter((x) => x !== undefined).map((x) => (x ? 1 : 0)));
function line(label: string, rs: Row[]) {
  const nonNeg = rs.filter((r) => r.category !== "negative");
  return [
    label,
    rs.length,
    pct(mean(nonNeg.map((r) => r.factScore))),
    pct(bool(rs.map((r) => r.negativeOk))),
    pct(bool(rs.map((r) => r.divergenceOk))),
    pct(mean(rs.map((r) => r.recall.retrieved?.pages))),
    pct(mean(rs.map((r) => r.recall.selected?.pages))),
    pct(mean(rs.map((r) => r.recall.kept?.pages))),
    pct(mean(rs.map((r) => r.recall.cited?.pages))),
    pct(bool(rs.map((r) => r.wrongEntity))),
    `$${(mean(rs.map((r) => r.usd)) ?? 0).toFixed(4)}`,
    `${((mean(rs.map((r) => r.ms)) ?? 0) / 1000).toFixed(1)}s`,
  ].join(" | ");
}
const header =
  "| group | n | key facts | negatives ok | divergence | retrieved pages | selected | kept | cited | wrong entity | $/q | time/q |\n|---|---|---|---|---|---|---|---|---|---|---|---|";
const groupBy = (key: keyof Row) => {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = String(r[key]);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return [...m.entries()]
    .sort()
    .map(([k, rs]) => `| ${line(k, rs)} |`)
    .join("\n");
};
const totalUsd = rows.reduce((s, r) => s + r.usd, 0);
const report = `# Evaluation report — ${runDir.split("/").pop()}

Mode: ${files.length ? (JSON.parse(await readFile(join(runDir, "answers", files[0] as string), "utf8")) as RunRecord).mode : "–"}; judge: ${judgeModel};
${rows.length} answers, ${rows.filter((r) => r.error).length} errors; query cost $${totalUsd.toFixed(2)}, judge cost $${rows
  .reduce((s, r) => s + r.judgeUsd, 0)
  .toFixed(2)}.

Columns: **key facts** = mean share of key facts present (partial = ½) over non-negative items;
**negatives ok** = negative items answered "not in the documents" without substitution;
**divergence** = conflict items naming every divergent value; **retrieved / selected / kept /
cited** = share of gold (document, page) pairs reached at that stage (the funnel); **wrong entity** =
answers presenting another entity's or date's fact.

## Overall

${header}
| ${line("all", rows)} |
| ${line(
  "needs OCR",
  rows.filter((r) => r.needsOcr),
)} |
| ${line(
  "text available",
  rows.filter((r) => !r.needsOcr),
)} |

## By category

${header}
${groupBy("category")}

## By cluster

${header}
${groupBy("cluster")}

## By difficulty

${header}
${groupBy("difficulty")}

## By route

${header}
${groupBy("queryKind")}

## Worst answers (key facts < 50 %, non-negative)

${rows
  .filter((r) => r.category !== "negative" && r.factScore < 0.5)
  .map(
    (r) =>
      `- \`${r.id}\` (${r.category}) ${pct(r.factScore)}; cited-page recall ${pct(r.recall.cited?.pages)}; ${r.comment ?? r.error ?? ""}`,
  )
  .join("\n")}
`;
await writeFile(join(runDir, "scores.json"), `${JSON.stringify(rows, null, 2)}\n`);
await writeFile(join(runDir, "report.md"), report);
console.log(report.split("## By category")[0]);
