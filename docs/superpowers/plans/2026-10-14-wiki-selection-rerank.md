# Wiki query — LLM rerank at selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before the 20-section cut in `SelectSections`, let an LLM choose the sections most likely to
hold the answer from the top 60 by search score, then fill to 20 in search order. Promote the change
only if an end-to-end run confirms it.

**Architecture:** `selectSections` stays pure and gains an optional `picks` list: indices into its own
search-score ranking, placed first. `SelectSectionsTrigger` makes one structured LLM call
(`select-sections`) when the project config enables it, and falls back to plain search order if the
call fails. `eval/run.ts` can switch the rerank on, and set its model, for a run, so the variants can
be compared end to end.

**Tech Stack:** TypeScript (ESM), zod, vitest, tsx, pnpm, biome.

**Spec:** the wiki optimisation stage notes ("Decomposition and LLM rerank, offline" and the stage 4
row), kept outside this repository.

## Evidence this plan argues from (offline replay, recorded intents, shares of all gold sections)

- An LLM choosing from the top 60, then filling to 20 in search order, kept more of the gold
  sections than the plain top 20 at the same budget; the strong model more than the cheap one, at
  about five times the extra cost per query.

- Widening the cut to 40 kept more gold but did not improve answers: the extra sections dilute the
  answer step. That is why the rerank chooses within the same 20, rather than adding sections.
- Splitting the question per entity or date does not raise search recall. It is out of scope here.

## Global Constraints

- File names are kebab-case. Tests run against real code. The LLM is the existing stub
  (`tests/util/stub-llm.ts`), never a mock of `selectSections`.
- No dataset names, paths, document text or figures in code, tests, comments or commit messages.
  Evaluation locations come from CLI arguments (`$EVAL_ROOT`, `$EVAL_PROJECT`, `$EVAL_QUESTIONS`,
  `$EVAL_REPORTS` in the commands below).
- The rerank is **off by default** until Task 4 promotes it. That keeps existing stubs, which throw
  on unknown call names, and existing behaviour unchanged.
- After the semantic review: `pnpm test`, `pnpm tsc --noEmit` and `pnpm biome check --write --unsafe`
  in `packages/wiki.core`, then commit and push.
- Promotion gate: in the end-to-end lean run, no category loses more than 3 key-fact points against
  `2026-10-13-baseline-lean-first`, and overall key facts rise. Report $/q next to the gain.

## Review Focus

- **The model returns out-of-range, duplicate or non-integer indices.** Ignore them; never throw and
  never return more than `topN` ranked sections. Pinned in Task 1.
- **The model returns nothing, or the call fails.** Selection equals today's search order. Pinned in
  Task 1 (empty `picks`) and Task 2 (stub throws).
- **Trusted sections** (`score >= 2`) are still kept on top and do not count against `topN`. Pinned
  in Task 1.
- **Fewer than 60 candidates.** Show what there is; no call when there are no candidates. Pinned in
  Task 2.
- **Abductive path.** The same trigger runs per iteration there. The rerank uses the iteration's
  hypothesis claim as the question when one is set, so it judges against what that iteration
  searched for. Covered by code review; the abductive tests keep the rerank off.

---

### Task 1: `picks` in `selectSections`

**Files:**
- Modify: `packages/wiki.core/src/query/fsm/select.ts`
- Test: `packages/wiki.core/tests/query/select.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SelectOptions {
    topN: number;
    /** Indices into the single-front-end candidates ranked by search score, most useful first.
     * Picked sections lead; the rest of `topN` is filled in search order. */
    picks?: number[];
  }
  /** The single-front-end candidates in search-score order — the list `picks` indexes. */
  export function rankBySearch(candidates: Candidate[]): Candidate[];
  ```

- [ ] **Step 1: Write the failing tests** (append to `tests/query/select.test.ts`)

```ts
describe("selectSections with picks", () => {
  const cs = [cand("a", 0.9), cand("b", 0.8), cand("c", 0.7), cand("d", 0.6)];

  it("puts picked sections first, then fills in search order", () => {
    expect(keys(selectSections(cs, { topN: 3, picks: [3, 1] }))).toEqual(["d", "b", "a"]);
  });

  it("ignores out-of-range, duplicate and fractional picks", () => {
    expect(keys(selectSections(cs, { topN: 2, picks: [9, -1, 2, 2, 1.5] }))).toEqual(["c", "a"]);
  });

  it("keeps the search order when there are no picks", () => {
    expect(keys(selectSections(cs, { topN: 2, picks: [] }))).toEqual(["a", "b"]);
  });

  it("keeps trusted sections on top of picks", () => {
    const withTrusted = [cand("t", 0.1, 2), ...cs];
    expect(keys(selectSections(withTrusted, { topN: 1, picks: [2] }))).toEqual(["t", "c"]);
  });
});
```

- [ ] **Step 2: Run them and check they fail**

Run: `cd packages/wiki.core && pnpm vitest run tests/query/select.test.ts`
Expected: the first, second and fourth new tests FAIL (picks are ignored). The third passes and pins
the fallback.

- [ ] **Step 3: Implement**

```ts
/** The single-front-end candidates in search-score order — the list `picks` indexes. */
export function rankBySearch(candidates: Candidate[]): Candidate[] {
  return candidates.filter((c) => c.score < 2).sort((a, b) => b.searchScore - a.searchScore);
}

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
```

Add one paragraph to the `selectSections` doc comment saying why picks fill rather than replace the
cut: a wider cut dilutes the answer step, and a cheap model returns only a handful of picks.

- [ ] **Step 4: Run the query tests**

Run: `cd packages/wiki.core && pnpm vitest run tests/query`
Expected: PASS.

- [ ] **Step 5: Commit** — `feat(wiki.core): selectSections takes ranked picks before the search-order fill`

---

### Task 2: The `select-sections` call behind a config switch

**Files:**
- Modify: `packages/wiki.core/src/llm/wiki-config.ts`. Add `querySelect?: string` to
  `StageModelNames` and `selectRerank?: boolean` to `WikiConfigData`, with a getter that defaults to
  `false`.
- Modify: `packages/wiki.core/src/query/fsm/prompts.ts`: `SELECT_PROMPT`.
- Modify: `packages/wiki.core/src/query/fsm/schemas.ts`: `selectInputSchema`, `selectSchema`.
- Modify: `packages/wiki.core/src/query/fsm/handlers.ts`: `SelectSectionsTrigger`.
- Modify: `packages/wiki.core/tests/util/stub-llm.ts`: pass `selectRerank` through `stubConfig`.
- Test: `packages/wiki.core/tests/query/wiki-query.lean.test.ts`

**Interfaces:**
- Consumes: `selectSections`, `rankBySearch`, `SELECT_TOP_N` (Task 1); `rawSectionText` from
  `retrieval.ts`.
- Produces:
  - `RERANK_POOL = 60` exported from `select.ts`.
  - Config `selectRerank` (default `false`) and model stage `querySelect`, which falls back to
    `default` like every other stage.
  - LLM call name `"select-sections"`, input
    `{ question: string; candidates: { index: number; document: string; title: string; summary: string; text: string }[] }`,
    output `{ selected: number[] }`.

Prompt text, in `prompts.ts`:
```ts
export const SELECT_PROMPT = `You select the document sections a reader must read to answer a question.
Each candidate has an index, its document, section title, summary, and the start of its raw text.
Return in \`selected\` the indices of the sections most likely to contain the facts a complete answer
needs, most useful first, at most 20. Prefer sections whose document matches the entity and the
date or period the question asks about. When the question asks about a change, a comparison or a
possible conflict, include every document that may hold a differing value for the asked quantity.
Skip sections about other entities or periods unless the question needs them.`;
```

Trigger change (sketch; `text` is the first 300 characters of the raw section, whitespace collapsed):
```ts
let picks: number[] | undefined;
const pool = rankBySearch(ctx.candidates).slice(0, RERANK_POOL);
if (cfg.selectRerank && pool.length > 0) {
  try {
    const candidates = await Promise.all(pool.map(async (c, index) => ({
      index,
      document: c.section.uri,
      title: c.section.title,
      summary: c.section.summary,
      text: (await rawSectionText(project, c.section.uri, c.section.sectionKey)).replace(/\s+/g, " ").slice(0, 300),
    })));
    const { output } = await timedGenerate(llm, log, progress, {
      name: "select-sections",
      model: cfg.modelFor("querySelect"),
      system: SELECT_PROMPT,
      input: { question: ctx.hypothesis?.claim ?? req.question, candidates },
      inputSchema: selectInputSchema,
      outputSchema: selectSchema,
      strict: true,
    });
    picks = output.selected;
  } catch (error) {
    log.warn("select-sections failed; keeping search order", { error: String(error) });
  }
}
const survivors = selectSections(ctx.candidates, { topN: SELECT_TOP_N, picks });
```
Add `picked: picks?.length ?? 0` to the existing `selected sections` log record.

- [ ] **Step 1: Write the failing tests** in `wiki-query.lean.test.ts`, using the file's existing
  fixture and stub style. Register the stub with `selectRerank: true`. In the stub's
  `generateObject` switch:
  - **Test A:** case `"select-sections"` records its input and returns `{ selected: [1, 0] }`.
    Assert that it was called once, with the request's question and with every fixture section as a
    candidate carrying its `title` and a non-empty `text`, and that the query completes. Which
    sections survive is pinned by Task 1's unit tests; the fixture is smaller than the cut.
  - **Test B:** case `"select-sections"` throws. Assert that the query still completes with the same
    answer as with the rerank off.
  - **Test C (off by default):** existing tests stay unchanged, with no `select-sections` case. They
    must keep passing, which proves the default is off.

- [ ] **Step 2: Run them and check A fails** (no call is made yet)
Run: `cd packages/wiki.core && pnpm vitest run tests/query/wiki-query.lean.test.ts`

- [ ] **Step 3: Implement** the config fields, prompt, schemas and trigger change above.

- [ ] **Step 4: Run all tests**
Run: `cd packages/wiki.core && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `feat(wiki.core): optional LLM rerank of the top 60 before the selection cut`

---

### Task 3: Switch the rerank on for an eval run

**Files:**
- Modify: `packages/wiki.core/eval/run.ts` (flag `--rerank <model>`)
- Modify: `packages/wiki.core/eval/run-all.sh` (optional 7th argument passed through as `--rerank`)

`--rerank <model>` sets, in memory only, the same way `--mode` overrides `queryMode`:
`selectRerank: true, models: { ...cfg.data.models, querySelect: <model> }`.

- [ ] **Step 1:** Implement, then run `pnpm tsc --noEmit`. Expected: clean.
- [ ] **Step 2:** Smoke test on 3 items:
  `npx tsx eval/run.ts "$EVAL_ROOT" "$EVAL_PROJECT" "$EVAL_QUESTIONS" /tmp/rerank-smoke --ids <3 ids> --rerank openai/gpt-4.1-mini`.
  Expected: each answer's trace has a `select-sections` call, and the `selected sections` log shows
  `picked > 0`.
- [ ] **Step 3: Commit** — `feat(wiki.core): eval runs can enable the selection rerank`

---

### Task 4: End-to-end comparison and promotion

- [ ] **Step 1:** Run both variants (about $8 and $13):
  ```bash
  eval/run-all.sh "$EVAL_ROOT" "$EVAL_PROJECT" "$EVAL_QUESTIONS" "$EVAL_REPORTS/<date>-rerank-mini-lean-first" lean-first 4 openai/gpt-4.1-mini
  eval/run-all.sh "$EVAL_ROOT" "$EVAL_PROJECT" "$EVAL_QUESTIONS" "$EVAL_REPORTS/<date>-rerank-strong-lean-first" lean-first 4 openai/gpt-4.1
  ```
- [ ] **Step 2:** Compare each with `2026-10-13-baseline-lean-first`: key facts by category,
  negatives ok, divergence, $/q and latency. Apply the gate (Global Constraints).
- [ ] **Step 3:** If a variant passes, make it the default. Set `selectRerank` to default `true` and
  default `querySelect` to the winning model's tier: unset, so it falls back to `default` for the
  cheap model; or set it in `resolveProvidersFromEnv` from `WIKI_MODEL_STRONG` for the strong one.
  Then update the stub defaults so existing tests stay explicit, and update the package README's
  query section in the same commit. If neither passes, leave the default off and record why in the
  `select.ts` comment.
- [ ] **Step 4:** Record the outcome in the stage notes. Run test, typecheck and biome, then commit
  and push.
