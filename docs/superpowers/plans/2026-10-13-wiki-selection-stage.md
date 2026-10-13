# Wiki query — selection stage (stage 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep more of the gold evidence that hybrid search already found when `SelectSections` cuts
about 100 candidates down to the ones the rolling summarizer reads. Measure every variant offline
against the 13 October baseline, then ship only the variant that wins.

**Architecture:** Extract the selection into a pure function, `selectSections`, behind the
`SelectSections` trigger. A replay script re-runs the lean retrieval with each recorded question's
intent subjects. It needs only a query embedding per subject and no LLM calls. It applies each
selection variant to the same candidates and reports gold-section retention. The winner becomes the
trigger's behaviour, and one end-to-end lean run confirms it against the baseline.

**Tech Stack:** TypeScript (ESM), vitest, tsx, pnpm, biome. The search runs on
`@statewalker/indexer-*` through `SearchAdapter`.

**Spec:** the wiki optimisation stage notes (stage 4 row and "Baseline" section), kept outside
this repository. The baseline reports are in
`$EVAL_REPORTS/2026-10-13-baseline-{lean-first,full-only}/`.

## What the baseline says about this stage

- Lean-first loses 21 points of gold-page recall at selection (85 → 64 %). 57 items first lose a
  gold page here, and the selection loss accounts for 22 items' worth of key facts.
- 199 of 224 lean queries have **one** subject. The note proposed per-subject quotas, but they would
  change almost nothing. This plan drops them.
- 106 of the 115 gold sections that selection dropped were surfaced by **both** search legs, so the
  loss is in ranking and cut-off, not in recall.
- An offline Python check on the recorded lists ranked candidates by query-term coverage of their
  raw text. Coverage alone is **worse** than the current RRF order at 20 (0.70 vs 0.75 retention),
  and better with a larger cut: 0.78 at 30, 0.84 at 40. The logs do not record the RRF scores, so
  "RRF at 30/40" cannot be computed offline. That is why Task 2 re-runs the search.

## Global Constraints

- File names are kebab-case.
- Tests run against real code. Search tests use the in-memory project the existing tests build
  (`tests/query/wiki-query.lean.test.ts` shows the setup). Never mock `selectSections`.
- After the semantic review, run `pnpm test`, `pnpm tsc --noEmit` and
  `pnpm biome check --write --unsafe` from `packages/wiki.core`, then commit and push.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01P9RsqV29FWkxv5XaRHzEam`.
- Evaluation inputs and outputs stay outside the repository. Their locations come from CLI
  arguments, set here from environment variables (`EVAL_ROOT` workspace root, `EVAL_PROJECT`
  project, `EVAL_QUESTIONS` question set, `EVAL_REPORTS` report directory), never from code.
- Promote a variant only when the end-to-end lean run shows no category losing more than 3 key-fact
  points against `2026-10-13-baseline-lean-first`. Report its cost per question next to the gain.

## Review Focus

- **Fewer candidates than the cut** (for example 7 candidates, topN 20): return all of them and do
  not pad. Pinned in Task 1.
- **Trusted sections** (`score >= 2`, surfaced by both front-ends in the abductive path) are kept on
  top of the ranked cut and never count against it. This is current behaviour that the abductive
  path relies on. Pinned in Task 1.
- **No terms** (an intent with empty `ftsQueries`): coverage falls back to the plain RRF order and
  must not reorder candidates at random. Pinned in Task 3.
- **Accents and case** (accented sources, unaccented terms such as "cafe" vs "Café"):
  coverage matching folds diacritics and case. Pinned in Task 3.
- **Replay drift.** If the re-run search does not reproduce the recorded candidate pool, every
  replay number is meaningless. Task 2 reports how far the replayed `baseline` variant agrees with
  the recorded `keptSections`, and the plan stops if agreement is below 90 %.

---

### Task 1: Extract `selectSections` as a pure function (behaviour unchanged)

**Files:**
- Create: `packages/wiki.core/src/query/fsm/select.ts`
- Modify: `packages/wiki.core/src/query/fsm/handlers.ts:478-515` (`SELECT_TOP_N` and
  `SelectSectionsTrigger`)
- Test: `packages/wiki.core/tests/query/select.test.ts`

**Interfaces:**
- Consumes: `Candidate` from `src/query/fsm/query-context.ts`
  (`{ section: EvidenceSection; score: number; searchScore: number }`).
- Produces:
  ```ts
  export interface SelectOptions { topN: number }
  export const SELECT_TOP_N = 20;
  export function selectSections(candidates: Candidate[], opts: SelectOptions): Candidate[];
  ```
  The returned list is the trusted sections (`score >= 2`, in input order) followed by the top `topN`
  single-front-end sections by `searchScore`, descending.

- [ ] **Step 1: Write the failing test**

```ts
// packages/wiki.core/tests/query/select.test.ts
import { describe, expect, it } from "vitest";
import type { Candidate } from "../../src/query/fsm/query-context.js";
import { selectSections } from "../../src/query/fsm/select.js";

const cand = (key: string, searchScore: number, score = 1): Candidate => ({
  section: { uri: "doc.pdf", sectionKey: key, title: key, summary: "" },
  score,
  searchScore,
});
const keys = (cs: Candidate[]) => cs.map((c) => c.section.sectionKey);

describe("selectSections", () => {
  it("keeps the top N single-front-end sections by search score", () => {
    const cs = [cand("a", 0.1), cand("b", 0.9), cand("c", 0.5)];
    expect(keys(selectSections(cs, { topN: 2 }))).toEqual(["b", "c"]);
  });

  it("keeps trusted sections on top of the cut, not inside it", () => {
    const cs = [cand("t", 0.01, 2), cand("a", 0.1), cand("b", 0.9)];
    expect(keys(selectSections(cs, { topN: 1 }))).toEqual(["t", "b"]);
  });

  it("returns every candidate when there are fewer than N", () => {
    const cs = [cand("a", 0.1), cand("b", 0.2)];
    expect(keys(selectSections(cs, { topN: 20 }))).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 2: Run the test and check it fails**

Run: `cd packages/wiki.core && pnpm vitest run tests/query/select.test.ts`
Expected: FAIL, because `select.js` cannot be resolved.

- [ ] **Step 3: Write the minimal implementation and route the trigger through it**

```ts
// packages/wiki.core/src/query/fsm/select.ts
import type { Candidate } from "./query-context.js";

/** Cap on the rank-based pre-filter: keep at most this many top-scored single-front-end sections. */
export const SELECT_TOP_N = 20;

export interface SelectOptions {
  topN: number;
}

/**
 * Mechanical, rank-based relevance pre-filter run before the rolling summarizer. Sections surfaced
 * by both front-ends (`score >= 2`) are kept unconditionally. The single-front-end remainder is
 * ranked by its hybrid-search RRF score and the top `topN` kept.
 */
export function selectSections(candidates: Candidate[], opts: SelectOptions): Candidate[] {
  const trusted = candidates.filter((c) => c.score >= 2);
  const ranked = candidates
    .filter((c) => c.score < 2)
    .sort((a, b) => b.searchScore - a.searchScore)
    .slice(0, opts.topN);
  return [...trusted, ...ranked];
}
```

In `handlers.ts`, delete the local `SELECT_TOP_N` constant. Move the long doc comment above the
trigger onto `selectSections`, keeping its "why the search score and not an LLM summary filter"
paragraph. Then make the trigger body:

```ts
export const SelectSectionsTrigger: QueryHandler = async function* (ctx) {
  const { project } = ctx;
  const before = ctx.candidates.length;
  const survivors = selectSections(ctx.candidates, { topN: SELECT_TOP_N });
  ctx.setCandidates(survivors);
  loggerOf(project, "QueryFsm").info("selected sections", {
    candidates: before,
    trusted: survivors.filter((c) => c.score >= 2).length,
    rankedKept: survivors.filter((c) => c.score < 2).length,
    kept: survivors.length,
    keptSections: survivors.map((c) => sectionId(c.section.uri, c.section.sectionKey)),
  });
  yield "selected";
};
```

Add the import: `import { SELECT_TOP_N, selectSections } from "./select.js";`.

- [ ] **Step 4: Run the new test and the whole query suite**

Run: `cd packages/wiki.core && pnpm vitest run tests/query`
Expected: PASS. All existing lean, abductive and scope tests stay green.

- [ ] **Step 5: Commit**

```bash
git add packages/wiki.core/src/query/fsm/select.ts packages/wiki.core/src/query/fsm/handlers.ts packages/wiki.core/tests/query/select.test.ts
git commit -m "refactor(wiki.core): selectSections as a pure function behind SelectSections"
```

---

### Task 2: Offline selection replay

**Files:**
- Create: `packages/wiki.core/eval/replay-select.ts`
- Modify: `packages/wiki.core/eval/README.md` if one exists; otherwise add a usage line to the
  header comment only

**Interfaces:**
- Consumes: `selectSections`, `SELECT_TOP_N` (Task 1); `hybridSearch`, `evidenceFor` and
  `rawSectionText` from `src/query/fsm/retrieval.ts`; `SearchAdapter`; the recorded
  `answers/<id>.json`, where `trace.calls[]` holds `{ name: "intent-detection", output: { subjects } }`
  and `trace.logs[]` holds `{ msg: "selected sections", extra: { keptSections } }`; and
  `stage0-reachability.json` `rows[]` `{ id, document, sections }`.
- Produces: `<out-dir>/stage4-selection.json` (per item and per variant: `{ id, category, variant,
  goldInPool, goldKept, kept }`) and `<out-dir>/stage4-selection.md`, a table of variant ×
  (retention = Σ goldKept / Σ goldInPool, mean kept sections, items with full retention), overall and
  by category. The script also prints `replay agreement: <share of items where the replayed
  baseline kept set equals the recorded one>`.

The variants are a plain list in the script, so adding one is one line:
```ts
const VARIANTS: { name: string; select: (cs: Candidate[], terms: string[], rawOf: (c: Candidate) => string) => Candidate[] }[] = [
  { name: "baseline", select: (cs) => selectSections(cs, { topN: SELECT_TOP_N }) },
  { name: "rrf@30", select: (cs) => selectSections(cs, { topN: 30 }) },
  { name: "rrf@40", select: (cs) => selectSections(cs, { topN: 40 }) },
];
```

- [ ] **Step 1: Write the script**

Usage: `tsx eval/replay-select.ts <workspace-root> <project> <reachability.json> <baseline-run-dir> <out-dir>`.

Bootstrap the workspace and project exactly as `eval/run.ts` does: `Workspace` +
`NodeFilesApi` + `registerWiki` + `resolveProvidersFromEnv`. The capturing logger is not needed;
pass a no-op `QueryLog`. Then for each `answers/*.json` in the run dir:
1. Read `subjects` from the `intent-detection` call output. Skip the item when there is no such
   call, or when no gold section in `reachability` belongs to it.
2. Rebuild the lean candidates the way `LeanRetrieveTrigger` does: `hybridSearch` per subject, keep
   the max `score` per section id, resolve with `evidenceFor`, and set `score: 1, searchScore`.
3. `terms` = the union of the subjects' `ftsQueries`. `rawOf` reads `rawSectionText` once per
   candidate, prefetched into a `Map`.
4. Gold = the item's `reachability` section ids (`${document}#${section}`). `goldInPool` = gold ∩
   candidate ids. For each variant, `goldKept` = gold ∩ the selected ids.
5. Compare the `baseline` variant's selected ids with the recorded `keptSections` as sets, for the
   agreement figure.

Write both outputs and print the summary table to stdout.

- [ ] **Step 2: Typecheck**

Run: `cd packages/wiki.core && pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run it on the lean baseline**

```bash
cd packages/wiki.core
# WIKI_PROVIDER, its key and the EVAL_* variables are set in the environment
npx tsx eval/replay-select.ts "$EVAL_ROOT" "$EVAL_PROJECT" "$EVAL_REPORTS/2026-10-13-baseline/stage0-reachability.json" "$EVAL_REPORTS/2026-10-13-baseline-lean-first" "$EVAL_REPORTS/2026-10-13-stage4-selection"
```

Expected:
- `replay agreement` ≥ 0.90. If it is lower, stop and report: the replay cannot stand in for the
  pipeline.
- `baseline` retention ≈ 0.75. That is the Python estimate on the recorded lists, using the same gold.
- `rrf@30` and `rrf@40` retention are printed. Cost: embeddings only, well under $0.10.

- [ ] **Step 4: Commit**

```bash
git add packages/wiki.core/eval/replay-select.ts
git commit -m "feat(wiki.core): offline replay of the selection stage against recorded intents"
```

---

### Task 3: Coverage-fused ranking variant

The aim is to re-rank by the search-rank score `1/(60 + rank)`, scaled by `1 + hits/terms`, where
`hits` counts the distinct query terms in the section's raw text and title. Coverage alone lost to
RRF in the Python check. A bounded boost keeps the search order as the base and lets term coverage
lift a section by a few places, not all the way to the top.

**Files:**
- Modify: `packages/wiki.core/src/query/fsm/select.ts`
- Modify: `packages/wiki.core/eval/replay-select.ts` (add variants)
- Test: `packages/wiki.core/tests/query/select.test.ts`

**Interfaces:**
- Consumes: `selectSections`, `SelectOptions` (Task 1).
- Produces: `SelectOptions` gains an optional field.
  ```ts
  export interface SelectOptions {
    topN: number;
    /** When set, rank by search rank boosted (up to ×2) by the share of query terms each section contains. */
    coverage?: { terms: string[]; textOf: (c: Candidate) => string };
  }
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/query/select.test.ts`:

```ts
const withText = (c: Candidate, text: string) => ({ c, text });

describe("selectSections with coverage", () => {
  it("lifts a lower-ranked section that matches more query terms", () => {
    const a = withText(cand("a", 0.9), "company overview");
    const b = withText(cand("b", 0.8), "annual widget sales by region 2021");
    const c = withText(cand("c", 0.7), "glossary");
    const texts = new Map([a, b, c].map((x) => [x.c, x.text]));
    const out = selectSections([a.c, b.c, c.c], {
      topN: 1,
      coverage: {
        terms: ["widget sales", "region", "2021"],
        textOf: (x) => texts.get(x) ?? "",
      },
    });
    expect(keys(out)).toEqual(["b"]);
  });

  it("matches terms regardless of accents and case", () => {
    const a = withText(cand("a", 0.9), "plain text");
    const b = withText(cand("b", 0.8), "Café de la gare — Été");
    const texts = new Map([a, b].map((x) => [x.c, x.text]));
    const out = selectSections([a.c, b.c], {
      topN: 1,
      coverage: { terms: ["cafe", "ete"], textOf: (x) => texts.get(x) ?? "" },
    });
    expect(keys(out)).toEqual(["b"]);
  });

  it("keeps the search-score order when there are no terms", () => {
    const cs = [cand("a", 0.1), cand("b", 0.9), cand("c", 0.5)];
    const out = selectSections(cs, { topN: 3, coverage: { terms: [], textOf: () => "x" } });
    expect(keys(out)).toEqual(["b", "c", "a"]);
  });
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `cd packages/wiki.core && pnpm vitest run tests/query/select.test.ts`
Expected: the first two new tests FAIL, because the order is by search score. The third passes
already, which is fine: it pins the fallback.

- [ ] **Step 3: Implement**

```ts
// in select.ts
const RRF_K = 60;

function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

export function selectSections(candidates: Candidate[], opts: SelectOptions): Candidate[] {
  const trusted = candidates.filter((c) => c.score >= 2);
  const bySearch = candidates
    .filter((c) => c.score < 2)
    .sort((a, b) => b.searchScore - a.searchScore);
  const terms = [...new Set((opts.coverage?.terms ?? []).map(fold))];
  let ranked = bySearch;
  if (opts.coverage && terms.length > 0) {
    const { textOf } = opts.coverage;
    const hits = new Map(
      bySearch.map((c) => {
        const text = fold(`${c.section.title}\n${textOf(c)}`);
        return [c, terms.filter((t) => text.includes(t)).length];
      }),
    );
    // The search-rank score 1/(k + rank), scaled by up to ×2 for the share of query terms the
    // section contains. Equal-weight RRF of two ranks cannot lift a section past one that is a
    // single place ahead (the scores tie); this boost can, without discarding the search order
    // the way a coverage-only sort does.
    const boosted = new Map(
      bySearch.map((c, i) => [c, (1 + (hits.get(c) ?? 0) / terms.length) / (RRF_K + i)]),
    );
    // Stable sort: ties keep the search-score order.
    ranked = [...bySearch].sort((a, b) => (boosted.get(b) ?? 0) - (boosted.get(a) ?? 0));
  }
  return [...trusted, ...ranked.slice(0, opts.topN)];
}
```

- [ ] **Step 4: Run the tests and check they pass**

Run: `cd packages/wiki.core && pnpm vitest run tests/query`
Expected: PASS.

- [ ] **Step 5: Add the variants to the replay and run it**

Add to `VARIANTS`:
```ts
  { name: "cov-boost@20", select: (cs, terms, rawOf) => selectSections(cs, { topN: 20, coverage: { terms, textOf: rawOf } }) },
  { name: "cov-boost@30", select: (cs, terms, rawOf) => selectSections(cs, { topN: 30, coverage: { terms, textOf: rawOf } }) },
```
Re-run the Task 2 Step 3 command.
Expected: a retention row for every variant in `stage4-selection.md`.

- [ ] **Step 6: Commit**

```bash
git add packages/wiki.core/src/query/fsm/select.ts packages/wiki.core/tests/query/select.test.ts packages/wiki.core/eval/replay-select.ts
git commit -m "feat(wiki.core): coverage-fused ranking option for section selection"
```

---

### Task 4: Promote the winner and confirm end to end

**Decision rule (applied to `stage4-selection.md`):** pick the variant with the highest retention.
A variant with more sections must gain at least 4 retention points per extra 10 sections, because
each extra 10 sections costs about $0.0065 per question in rolling-summarize calls (baseline: 20
sections ≈ $0.013). When nothing beats `baseline` by 3 points, stop: record the result in the note
and do not change the trigger. Remove the `coverage` option if it lost, so no unused option
remains.

**Files:**
- Modify: `packages/wiki.core/src/query/fsm/select.ts` (`SELECT_TOP_N` value) and/or
  `packages/wiki.core/src/query/fsm/handlers.ts` (pass `coverage` in `SelectSectionsTrigger`)
- Modify: the stage notes outside this repository (stage 4 row and a short "Stage 4 result"
  paragraph)

- [ ] **Step 1: Wire the winner**

If the winner uses coverage, `SelectSectionsTrigger` computes the terms and raw text:
```ts
const terms = ctx.hypothesis
  ? ctx.hypothesis.searchCriteria.ftsQueries
  : ctx.intent.subjects.flatMap((s) => s.ftsQueries);
const raws = new Map(
  await Promise.all(
    ctx.candidates.map(async (c) => [c, await rawSectionText(project, c.section.uri, c.section.sectionKey)] as const),
  ),
);
const survivors = selectSections(ctx.candidates, {
  topN: SELECT_TOP_N,
  coverage: { terms, textOf: (c) => raws.get(c) ?? "" },
});
```
If the winner only changes N, change `SELECT_TOP_N` and nothing else.

- [ ] **Step 2: Run the full package checks**

```bash
cd packages/wiki.core && pnpm test && pnpm tsc --noEmit && pnpm biome check --write --unsafe
```
Expected: all pass.

- [ ] **Step 3: End-to-end lean run against the baseline**

```bash
cd packages/wiki.core && eval/run-all.sh "$EVAL_ROOT" "$EVAL_PROJECT" "$EVAL_QUESTIONS" "$EVAL_REPORTS/2026-10-13-stage4-lean-first" lean-first 4
```
Expected: `$EVAL_REPORTS/2026-10-13-stage4-lean-first/report.md`. Compare it with
`2026-10-13-baseline-lean-first`:
- `selected` page recall goes up;
- key facts do not drop by more than 3 points in any category (Global Constraints);
- record $/q. The cost is about $6–8.

- [ ] **Step 4: Record and commit**

Update the stage 4 row with baseline → new retention, end-to-end key facts and $/q. Add a "Stage 4
result" paragraph.

```bash
git add packages/wiki.core/src/query/fsm/select.ts packages/wiki.core/src/query/fsm/handlers.ts
git commit -m "feat(wiki.core): <winner> section selection (stage 4: retention X → Y, key facts A → B)"
git push -u origin feat/wiki-eval
```
