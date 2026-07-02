import { loggerOf, type Project } from "@statewalker/workspace.core";
import type { z } from "zod";
import { WikiTopicIndex } from "../../knowledge/indexes.js";
import type { DocumentMeta } from "../../knowledge/types.js";
import { type LlmApi, llmOf, type WikiLlmConfiguration, wikiConfigOf } from "../../llm/index.js";
import { SearchAdapter } from "../../search/index.js";
import { mapLimit } from "../../util/batch.js";
import type { EvidenceSection, QueryProgress } from "../progress.js";
import { logBatchTotals, timedGenerate } from "./llm-call.js";
import {
  COMPOSE_PROMPT,
  HYPOTHESIZE_PROMPT,
  INTENT_DETECTION_PROMPT,
  ROLLING_SUMMARIZE_PROMPT,
  SCORE_PROMPT,
  TOPIC_SELECT_PROMPT,
} from "./prompts.js";
import {
  type Candidate,
  DEFAULT_ITERATION_BUDGET,
  type GroundedFact,
  type HardConstraint,
  type Hypothesis,
  type Subject,
} from "./query-context.js";
import type { QueryHandler } from "./query-fsm.js";
import {
  aggregateClasses,
  buildDocTopicCandidates,
  buildRollingBatches,
  evidenceFor,
  filterCitations,
  hybridSearch,
  rawSectionText,
  readClassIndexes,
  sectionId,
  withinScope,
} from "./retrieval.js";
import {
  composeInputSchema,
  composeSchema,
  type hardConstraintSchema,
  hypothesizeInputSchema,
  hypothesizeSchema,
  intentDetectionInputSchema,
  intentDetectionSchema,
  rollingSummarizeInputSchema,
  rollingSummarizeSchema,
  scoreInputSchema,
  scoreSchema,
  topicSelectInputSchema,
  topicSelectSchema,
} from "./schemas.js";
import { topicDescent } from "./topic-descent.js";

/** Perimeter-expansion axes for the `narrow` re-entry, in priority order (D4). */
const PERIMETER_AXES = ["vocabulary", "scope", "genre"] as const;

/** A `z`-flat hard constraint (kind + tokens + text) reconstructed into the narrowed union. */
function toHardConstraint(c: z.infer<typeof hardConstraintSchema>): HardConstraint {
  return c.kind === "predicate"
    ? { kind: "predicate", text: c.text }
    : { kind: c.kind, tokens: c.tokens };
}

/** The entity/scope constraints (the mechanical gate's checklist); predicate is advisory-only. */
function gatedConstraints(
  constraints: HardConstraint[],
): Array<{ kind: "entity" | "scope"; tokens: string[] }> {
  return constraints.filter(
    (c): c is { kind: "entity" | "scope"; tokens: string[] } => c.kind !== "predicate",
  );
}

/** Whether one section's raw text covers a token-set constraint: any token present (case-insensitive). */
function sectionCovers(raw: string, tokens: string[]): boolean {
  const hay = raw.toLowerCase();
  return tokens.some((t) => t.trim() !== "" && hay.includes(t.toLowerCase()));
}

/** Char budget for one rolling-summarization batch's `<sources>` payload (raw content + scaffolding). */
const ROLLING_CHAR_BUDGET = 20_000;
/** Max rolling-summarization calls in flight at once. */
const ROLLING_CONCURRENCY = 5;

/** Render answer claims to prose: each statement followed by its `[[ref]]` citations. Partial-safe
 * (fields may be missing mid-stream); skips empty entries. */
function renderClaims(
  claims: ReadonlyArray<{ statement?: string; citations?: readonly string[] } | undefined>,
): string {
  return claims
    .filter((c) => c != null)
    .map((c) => {
      const cites = (c?.citations ?? []).map((r) => `[[${r}]]`).join("; ");
      const statement = c?.statement ?? "";
      return cites ? `${statement} ${cites}` : statement;
    })
    .join("\n");
}

const toClass = (c: { key: string; name: string; description?: string }) => ({
  key: c.key,
  name: c.name,
  description: c.description,
});

/**
 * Classify on/off-corpus and decompose the prompt into distinct search subjects.
 * The corpus vocabulary supplied is the topic index's ROOT CATEGORIES (the thematic
 * skeleton, bounded by fan-out) plus the flat outliers — not the whole topic list,
 * which on a large DAG is the same context-window risk the build side removed. Deep
 * topic specifics are the per-subject descent's job. Sets `ctx.intent`; yields
 * `onCorpus` | `offCorpus`.
 */
export const IntentDetectionTrigger: QueryHandler = async function* (ctx) {
  const { project, request: req, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const log = loggerOf(project, "QueryFsm");
  const { outliers } = await readClassIndexes(project);
  const categories = await project.requireAdapter(WikiTopicIndex).roots();

  const { output } = await timedGenerate(llm, log, progress, {
    name: "intent-detection",
    description:
      "Classify on/off-corpus and decompose the prompt into search subjects. Does NOT answer it.",
    model: cfg.modelFor("query"),
    system: INTENT_DETECTION_PROMPT,
    input: {
      question: req.question,
      availableTopics: categories.map(toClass),
      availableOutliers: [...outliers.values()].map(toClass),
    },
    inputSchema: intentDetectionInputSchema,
    outputSchema: intentDetectionSchema,
    strict: true,
  });

  // Normalize each subject: fall back to its prompt for an empty keyword list. Recall-first:
  // an on-corpus prompt with no subjects becomes the whole question.
  const subjects: Subject[] = (
    output.onCorpus && output.subjects.length === 0
      ? [{ prompt: req.question, ftsQueries: [req.question] }]
      : output.subjects
  ).map((s) => ({
    prompt: s.prompt,
    ftsQueries: s.ftsQueries?.length ? s.ftsQueries : [s.prompt],
  }));
  // Default to `lookup` when the model omits/garbles the field (precision-biased toward the lean path).
  const queryKind = output.queryKind === "synthesis" ? "synthesis" : "lookup";
  progress.queryKind = queryKind;
  ctx.setIntent({
    onCorpus: output.onCorpus,
    subjects: output.onCorpus ? subjects : [],
    // Hard constraints feed both `Hypothesize` projection and the `Score` coverage gate.
    constraints: (output.constraints ?? []).map(toHardConstraint),
    queryKind,
    offCorpusReason: output.offCorpusReason ?? undefined,
    // The answer is composed in the request's language; English when undetectable.
    language: output.language?.trim() || "English",
  });

  if (!output.onCorpus) {
    yield "offCorpus";
    return;
  }
  // Route: lean single-pass only for a `lookup` query under `lean-first`; otherwise (a `synthesis`
  // query, or `full-only` mode) fast-forward to the abductive loop.
  const lean = cfg.queryMode === "lean-first" && queryKind === "lookup";
  log.info("intent routed", {
    queryMode: cfg.queryMode,
    queryKind,
    path: lean ? "lean" : "abductive",
  });
  if (lean) {
    ctx.enterLean();
    yield "lean";
  } else {
    yield "abductive";
  }
};

/**
 * The lean retrieval front-end: hybrid search ONLY (no topic descent / class ladder), seeded
 * mechanically from the intent's subjects (their `ftsQueries` + prompt), unioned and deduped by
 * section. Resolves candidates into `ctx.candidates` for the shared `SelectSections` / `RollingSummarize`
 * states with `score = 1` (single front-end). An empty result escalates straight to `Hypothesize`
 * (the abductive loop's topic descent may still find evidence hybrid search missed); otherwise yields
 * `retrieved`.
 */
export const LeanRetrieveTrigger: QueryHandler = async function* (ctx) {
  const { project } = ctx;
  const log = loggerOf(project, "QueryFsm");
  const paths = ctx.request.paths;
  const search = project.getAdapter(SearchAdapter);
  const subjects = ctx.intent.subjects;

  // Per unique section, keep the best hybrid-search RRF score (→ the rank-based pre-filter).
  const signal = new Map<string, { uri: string; sectionKey: string; searchScore: number }>();
  const record = (hits: { uri: string; sectionKey: string; score?: number }[]) => {
    for (const h of hits) {
      const id = sectionId(h.uri, h.sectionKey);
      const e = signal.get(id) ?? { uri: h.uri, sectionKey: h.sectionKey, searchScore: 0 };
      if (h.score !== undefined) e.searchScore = Math.max(e.searchScore, h.score);
      signal.set(id, e);
    }
  };
  if (search) {
    // hybridSearch honours `paths` internally (scope), so no post-filter is needed.
    const perSubject = await Promise.all(subjects.map((s) => hybridSearch(search, log, s, paths)));
    for (const hits of perSubject) record(hits);
  }

  const entries = [...signal.values()];
  const resolved = await Promise.all(entries.map((e) => evidenceFor(project, e.uri, e.sectionKey)));
  const candidates: Candidate[] = [];
  entries.forEach((e, i) => {
    const section = resolved[i];
    if (section) candidates.push({ section, score: 1, searchScore: e.searchScore });
  });
  ctx.setCandidates(candidates);
  log.info("lean retrieved", { subjects: subjects.length, sections: candidates.length });

  if (candidates.length === 0) {
    ctx.escalate();
    yield "empty";
    return;
  }
  yield "retrieved";
};

/**
 * The abductive head (GEN, cheap tier, runs on EVERY pass starting #1, D9). Generate the
 * single most-promising rival candidate answer and PROJECT its probe: the English `ftsQueries`
 * (literalised hard-constraint tokens + predicted answer vocabulary — driving both the full-text
 * leg and, concatenated, the vector leg) and synonym variants folded into the gate's token sets.
 * On re-entry (`contradicted`) the consumed-rivals list steers the model to a DIFFERENT candidate.
 * Mechanically injects any omitted entity/scope token into `ftsQueries`. Sets `ctx.hypothesis`;
 * yields `hypothesized`.
 */
export const HypothesizeTrigger: QueryHandler = async function* (ctx) {
  const { project, request: req, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const log = loggerOf(project, "QueryFsm");
  const constraints = ctx.intent.constraints;
  const flatConstraints = constraints.map((c) =>
    c.kind === "predicate"
      ? { kind: c.kind, tokens: [], text: c.text }
      : { kind: c.kind, tokens: c.tokens, text: "" },
  );

  const { output } = await timedGenerate(llm, log, progress, {
    name: "hypothesize",
    description:
      "Project the single most-promising rival candidate answer into a searchCriteria probe. Does NOT answer the prompt.",
    model: cfg.modelFor("queryFast"),
    system: HYPOTHESIZE_PROMPT,
    input: {
      question: req.question,
      constraints: flatConstraints,
      consumedRivals: [...ctx.consumedRivals],
    },
    inputSchema: hypothesizeInputSchema,
    outputSchema: hypothesizeSchema,
    strict: true,
  });

  // Mechanically guarantee every entity/scope token is in the probe (recall floor — D5/§5.1):
  // the model may omit a constraint token, but the gate searches for exactly those tokens.
  const ftsQueries = [...output.ftsQueries];
  for (const c of gatedConstraints(constraints)) {
    for (const t of c.tokens) if (!ftsQueries.includes(t)) ftsQueries.push(t);
  }
  // Fold PROJECT synonyms into the gate's token sets so coverage matches alternate phrasings.
  const synonyms = output.synonyms ?? [];
  const enriched: HardConstraint[] = constraints.map((c) =>
    c.kind === "predicate" ? c : { kind: c.kind, tokens: [...c.tokens, ...synonyms] },
  );

  const hypothesis: Hypothesis = {
    claim: output.claim,
    searchCriteria: {
      ftsQueries,
    },
    constraints: enriched,
  };
  ctx.setHypothesis(hypothesis);
  log.info("hypothesized", {
    iteration: ctx.iteration,
    claim: hypothesis.claim,
    ftsQueries: hypothesis.searchCriteria.ftsQueries,
    rivals: ctx.consumedRivals.length,
  });
  yield "hypothesized";
};

/**
 * Flat outlier selection for one subject: the topic index is a DAG (descended by
 * `topicDescent`), but outliers stay a short flat list, so one exhaustive select
 * call picks the relevant outlier classes and resolves them to candidate sections.
 * Recall-only — precision is deferred to the section-relevance filter.
 */
async function outlierSelect(
  project: Project,
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  progress: QueryProgress,
  subjectPrompt: string,
  metaCache: Map<string, DocumentMeta | undefined>,
): Promise<{ uri: string; sectionKey: string }[]> {
  const { outliers } = await readClassIndexes(project);
  if (outliers.size === 0) return [];

  const { output: sel } = await timedGenerate(llm, loggerOf(project, "QueryFsm"), progress, {
    name: "outlier-select",
    description: "Exhaustively select relevant outlier class keys for the subject.",
    model: cfg.modelFor("query"),
    system: TOPIC_SELECT_PROMPT,
    input: {
      subject: subjectPrompt,
      availableTopics: [],
      availableOutliers: [...outliers.values()].map(toClass),
    },
    inputSchema: topicSelectInputSchema,
    outputSchema: topicSelectSchema,
    strict: true,
  });

  const selOutliers = sel.outlierKeys.map((k) => outliers.get(k)).filter((o) => o !== undefined);
  const candidates = await buildDocTopicCandidates(
    project,
    selOutliers,
    (m) => m.outliers,
    metaCache,
  );
  return candidates.flatMap((c) => c.sectionKeys.map((sk) => ({ uri: c.baseUri, sectionKey: sk })));
}

/**
 * The topic/outlier front-end for one subject: topics via embedding-seeded scored
 * DAG descent ({@link topicDescent}), outliers via flat selection. Both expand to
 * `{ uri, sectionKey }` candidate sections through the same per-document reference
 * chain, so the section-emission boundary (and the downstream fusion + tiers) is
 * unchanged. Recall-only — precision is deferred to `SelectSections`.
 */
async function classLadder(
  project: Project,
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  progress: QueryProgress,
  subjectPrompt: string,
  metaCache: Map<string, DocumentMeta | undefined>,
): Promise<{ uri: string; sectionKey: string }[]> {
  const [topicHits, outlierHits] = await Promise.all([
    topicDescent(project, llm, cfg, progress, subjectPrompt, metaCache),
    outlierSelect(project, llm, cfg, progress, subjectPrompt, metaCache),
  ]);
  return [...topicHits, ...outlierHits];
}

/**
 * The probe (PROBE) — driven by the CURRENT hypothesis's `searchCriteria` (D11), not a
 * static per-subject fan-out. Opens a loop iteration, runs hybrid search + the class ladder
 * for the hypothesis's one `searchCriteria`, and resolves the union into `ctx.candidates`.
 * On a `narrow` re-entry (same hypothesis) the perimeter is expanded along the next unmet
 * axis. Per-iteration empties no longer terminate (D10): always yields `retrieved` and lets
 * `Score`'s controller decide. Candidates are pooled (skip-resummarize) by `RollingSummarize`.
 */
export const RetrieveTrigger: QueryHandler = async function* (ctx) {
  const { project, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const paths = ctx.request.paths;
  const search = project.getAdapter(SearchAdapter);
  const log = loggerOf(project, "QueryFsm");
  const metaCache = new Map<string, DocumentMeta | undefined>();
  const hypothesis = ctx.hypothesis;
  if (!hypothesis) throw new Error("Retrieve reached without a hypothesis");

  ctx.nextIteration();
  // Perimeter expansion on a `narrow` re-entry: widen the FTS probe along the next unspent
  // axis (vocabulary → scope → genre). The widening is a recall move; the gate is unchanged.
  const reentry = ctx.beginRetrieveForCurrentHypothesis();
  const ftsQueries = [...hypothesis.searchCriteria.ftsQueries];
  if (reentry) {
    const axis = ctx.consumeNextAxis(PERIMETER_AXES);
    if (axis === "scope" || axis === "vocabulary") {
      // Literalize every gated-constraint token + synonym into the probe (broadest recall).
      for (const c of gatedConstraints(hypothesis.constraints))
        for (const t of c.tokens) if (!ftsQueries.includes(t)) ftsQueries.push(t);
    }
    log.info("perimeter expanded", { axis, iteration: ctx.iteration });
  }

  // One retrieval "subject" = the current hypothesis's projected probe (D11).
  const subject: Subject = {
    prompt: hypothesis.claim,
    ftsQueries: ftsQueries.length > 0 ? ftsQueries : [hypothesis.claim],
  };

  // Per unique section, track which front-ends surfaced it (→ score) and the best hybrid-search
  // RRF score it earned (→ rank-based pre-filter). Both front-ends ⇒ a stronger signal.
  const signal = new Map<
    string,
    { uri: string; sectionKey: string; fronts: Set<string>; searchScore: number }
  >();
  const record = (hits: { uri: string; sectionKey: string; score?: number }[], front: string) => {
    for (const h of hits) {
      const id = sectionId(h.uri, h.sectionKey);
      const e = signal.get(id) ?? {
        uri: h.uri,
        sectionKey: h.sectionKey,
        fronts: new Set<string>(),
        searchScore: 0,
      };
      e.fronts.add(front);
      if (h.score !== undefined) e.searchScore = Math.max(e.searchScore, h.score);
      signal.set(id, e);
    }
  };
  const [searchHits, ladderHits] = await Promise.all([
    search ? hybridSearch(search, log, subject, paths) : Promise.resolve([]),
    classLadder(project, llm, cfg, progress, subject.prompt, metaCache),
  ]);
  record(searchHits, "search");
  // The topic ladder descends to whole documents; keep only in-scope sections so the scope
  // restricts both front-ends, not just hybrid search.
  record(
    ladderHits.filter((h) => withinScope(h.uri, paths)),
    "ladder",
  );

  // Resolve evidence once per unique section; attach the retrieval signal.
  const entries = [...signal.values()];
  const resolved = await Promise.all(entries.map((e) => evidenceFor(project, e.uri, e.sectionKey)));
  const candidates: Candidate[] = [];
  entries.forEach((e, i) => {
    const section = resolved[i];
    if (section) candidates.push({ section, score: e.fronts.size, searchScore: e.searchScore });
  });

  ctx.setCandidates(candidates);
  const perDoc = new Map<string, string[]>();
  for (const c of candidates) {
    const keys = perDoc.get(c.section.uri) ?? [];
    keys.push(c.section.sectionKey);
    perDoc.set(c.section.uri, keys);
  }
  log.info("retrieved evidence", {
    iteration: ctx.iteration,
    claim: hypothesis.claim,
    sections: candidates.length,
    documents: perDoc.size,
    sectionsPerDoc: [...perDoc.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([uri, keys]) => [`${keys.length}× ${uri}`, ...keys]),
  });
  yield "retrieved";
};

/** Cap on the rank-based pre-filter: keep at most this many top-scored single-front-end sections. */
const SELECT_TOP_N = 20;

/**
 * Mechanical, rank-based relevance pre-filter that narrows the retrieved candidates BEFORE the
 * expensive raw-content rolling summarization — WITHOUT an LLM summary filter.
 *
 * Sections surfaced by BOTH front-ends (hybrid search AND the topic ladder, `score >= 2`) are
 * kept unconditionally: their dual agreement is a strong signal. The single-front-end remainder is
 * ranked by its hybrid-search RRF score and the top {@link SELECT_TOP_N} kept. Ranking on the
 * search score (NOT a model re-reading the summary) is what keeps the answer section: full-text
 * search indexes the RAW content, so a section whose summary omits the queried entity/figure still
 * scores — whereas a summary-based LLM filter drops exactly those. Survivors replace
 * `ctx.candidates`. Always yields `selected` (a zero-survivor iteration is a zero-coverage input
 * to `Score`'s controller, not a terminal `empty` — D10).
 */
export const SelectSectionsTrigger: QueryHandler = async function* (ctx) {
  const { project } = ctx;
  const before = ctx.candidates.length;
  const trusted = ctx.candidates.filter((c) => c.score >= 2);
  const ranked = ctx.candidates
    .filter((c) => c.score < 2)
    .sort((a, b) => b.searchScore - a.searchScore)
    .slice(0, SELECT_TOP_N);
  const survivors = [...trusted, ...ranked];
  ctx.setCandidates(survivors);
  loggerOf(project, "QueryFsm").info("selected sections", {
    candidates: before,
    trusted: trusted.length,
    rankedKept: ranked.length,
    kept: survivors.length,
    keptSections: survivors.map((c) => sectionId(c.section.uri, c.section.sectionKey)),
  });
  yield "selected";
};

/**
 * Conditional rolling summarization: over the relevance-filtered candidate sections, render each
 * leaf's raw content within its ancestor TOC path, grouped by document
 * (each batch repeats the document summary), and in a SEPARATE call per batch (≤ ROLLING_CONCURRENCY
 * in parallel, cheap model) summarize each section AGAINST the prompt. A section with nothing
 * relevant is skipped — no entry, no citation. Each kept summary becomes a single-section grounded
 * "fact" ({ statement: summary, citations: [sectionRef] }); the sections that produced one form the
 * evidence and are added to the cross-iteration pool. Sections ALREADY pooled (from a prior
 * iteration) are skipped — never re-summarized (D8). Always yields `summarized` (a zero-kept
 * iteration is a zero-coverage input to `Score`, not a terminal `empty` — D10).
 */
export const RollingSummarizeTrigger: QueryHandler = async function* (ctx) {
  const { project, request: req, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const log = loggerOf(project, "QueryFsm");

  // Skip sections already in the pool — they were summarized in a prior iteration (D8).
  const candidateSections = ctx.candidates
    .map((c) => c.section)
    .filter((s) => !ctx.poolHas(s.uri, s.sectionKey));
  const batches = await buildRollingBatches(project, candidateSections, ROLLING_CHAR_BUDGET);
  log.info("rolling summarize batches", {
    candidates: candidateSections.length,
    batches: batches.length,
  });

  const startedAt = Date.now();
  const results = await mapLimit(batches, ROLLING_CONCURRENCY, async (batch, b) => {
    const { output, usage } = await timedGenerate(
      llm,
      log,
      progress,
      {
        name: "rolling-summarize",
        description:
          "Extract each candidate section's prompt-relevant facts from its raw content; skip non-relevant sections; cite each kept summary's section ref.",
        // Cheap tier — the strong model is reserved for the final compose.
        model: cfg.modelFor("queryFast"),
        system: ROLLING_SUMMARIZE_PROMPT,
        input: {
          request: `<question>\n${req.question}\n</question>\n\n<sources>\n${batch.payload}\n</sources>`,
        },
        inputSchema: rollingSummarizeInputSchema,
        outputSchema: rollingSummarizeSchema,
        strict: true,
      },
      { batch: b + 1, of: batches.length },
    );
    // Mechanical grounding: keep only entries whose sectionRef is a section in this batch.
    const facts: GroundedFact[] = [];
    const kept: EvidenceSection[] = [];
    for (const s of output.summaries) {
      const section = batch.sections.get(s.sectionRef);
      if (!section || !s.summary.trim()) continue;
      facts.push({ statement: s.summary, citations: [s.sectionRef] });
      kept.push(section);
    }
    return { facts, kept, usage };
  });
  logBatchTotals(
    log,
    "rolling-summarize",
    cfg.modelFor("queryFast"),
    startedAt,
    results.map((r) => r.usage),
  );

  ctx.addFacts(results.flatMap((r) => r.facts));
  // The sections that produced a kept summary are the evidence (drives topics + citation verify).
  const kept = results.flatMap((r) => r.kept);
  await ctx.addEvidence(kept);
  // Pool each newly-summarized section with its RAW text — the cross-iteration memory the
  // `Score` gate checks coverage against and the best-partial path selects over (D8).
  const raws = await Promise.all(kept.map((s) => rawSectionText(project, s.uri, s.sectionKey)));
  kept.forEach((s, i) => {
    ctx.poolAdd(s, raws[i] ?? "");
  });
  log.info("rolling summaries", {
    kept: ctx.facts.length,
    poolSize: ctx.pool.length,
    sections: ctx.evidence.length,
    keptSections: ctx.evidence.map((e) => sectionId(e.uri, e.sectionKey)),
  });
  // Shared state: on the lean pass route to LeanRespond; on the full path to the Score gate.
  yield ctx.leanActive ? "summarizedLean" : "summarized";
};

/**
 * The coverage GATE with the folded loop controller (D7/D9). Coverage is decided MECHANICALLY:
 * each entity/scope hard constraint is covered iff its token set appears in some pooled section's
 * RAW text; FULL coverage means a SINGLE pooled section covers ALL gated constraints (so a
 * near-miss spread across two documents does not pass). The analytic predicate never gates — it
 * is an advisory LLM rank among survivors (here folded into the narrow/contradicted classification).
 *
 * Coverage-FIRST ordering (the short-circuit is load-bearing): (1) compute coverage; (2) full
 * coverage → `covered`, even when the budget is already spent; (3) else budget spent / doom-loop
 * (no NEW pool section this iteration) / no unspent axis-or-rival → `exhausted` (`exhaustedEmpty`
 * when the pool is empty); (4) else classify the failure via the LLM (advisory) → `narrow` or
 * `contradicted` (a `narrow` with no unspent axis degrades to `exhausted`). Records the unmet
 * constraints on the context for the best-partial caveat.
 */
export const ScoreTrigger: QueryHandler = async function* (ctx) {
  const { project, request: req, progress } = ctx;
  const log = loggerOf(project, "QueryFsm");
  const hypothesis = ctx.hypothesis;
  if (!hypothesis) throw new Error("Score reached without a hypothesis");

  const gated = gatedConstraints(hypothesis.constraints);
  const pool = ctx.pool;

  // (1) Mechanical coverage. A constraint is covered if ANY pooled section covers it (for the
  // unmet/caveat report); FULL coverage requires a SINGLE section to cover EVERY gated constraint.
  const fullyCovering = pool.find((p) => gated.every((c) => sectionCovers(p.raw, c.tokens)));
  const unmet: HardConstraint[] = gated.filter(
    (c) => !pool.some((p) => sectionCovers(p.raw, c.tokens)),
  );
  ctx.setUnmet(unmet);

  // (2) Coverage success short-circuits exhaustion — a successful final iteration is not exhaustion.
  if (gated.length > 0 && fullyCovering) {
    log.info("score covered", {
      iteration: ctx.iteration,
      coveringSection: sectionId(fullyCovering.section.uri, fullyCovering.section.sectionKey),
    });
    yield "covered";
    return;
  }
  // A prompt with no gated constraints cannot gate on coverage: any evidence is "covered",
  // an empty pool is exhausted-empty.
  if (gated.length === 0) {
    if (!ctx.poolEmpty) {
      yield "covered";
      return;
    }
  }

  // (3) Exhaustion controller (mechanical). Budget spent / doom-loop / no unspent axis.
  const budgetSpent = ctx.iteration >= DEFAULT_ITERATION_BUDGET;
  const doomLoop = !ctx.addedNewThisIteration;
  if (budgetSpent || doomLoop) {
    const event = ctx.poolEmpty ? "exhaustedEmpty" : "exhausted";
    log.info("score exhausted", {
      iteration: ctx.iteration,
      reason: budgetSpent ? "budget" : "doom-loop",
      poolEmpty: ctx.poolEmpty,
      unmet: unmet.map((c) => (c.kind === "predicate" ? c.text : c.tokens.join("|"))),
    });
    yield event;
    return;
  }

  // (4) Advisory failure classification → deterministic loop-back. The predicate, if any, is
  // surfaced to the LLM here so it informs the (advisory) narrow/contradicted call.
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const flatUnmet = unmet.map((c) =>
    c.kind === "predicate"
      ? { kind: c.kind, tokens: [], text: c.text }
      : { kind: c.kind, tokens: c.tokens, text: "" },
  );
  const { output } = await timedGenerate(llm, log, progress, {
    name: "score",
    description:
      "Advisory narrow-vs-contradicted classification of a failed retrieval iteration. Coverage is decided mechanically elsewhere.",
    model: cfg.modelFor("queryFast"),
    system: SCORE_PROMPT,
    input: {
      question: req.question,
      claim: hypothesis.claim,
      unmetConstraints: flatUnmet,
      evidence: ctx.facts.map((f) => f.statement),
    },
    inputSchema: scoreInputSchema,
    outputSchema: scoreSchema,
    strict: true,
  });

  if (output.failureMode === "contradicted") {
    log.info("score contradicted", { iteration: ctx.iteration, claim: hypothesis.claim });
    yield "contradicted";
    return;
  }
  // `narrow`: widen the SAME hypothesis — but only if an axis remains; else exhausted.
  if (!ctx.hasUnspentAxis(PERIMETER_AXES)) {
    log.info("score narrow with no axis left → exhausted", { iteration: ctx.iteration });
    yield ctx.poolEmpty ? "exhaustedEmpty" : "exhausted";
    return;
  }
  log.info("score narrow", { iteration: ctx.iteration, claim: hypothesis.claim });
  yield "narrow";
};

/**
 * Compose the grounded, cited answer from the rolling section summaries (strong model). Keeps only
 * grounded claims. On the best-partial path (`Score` exhausted over a non-empty pool with unmet
 * constraints) it composes the best grounded answer the pool supports and attaches an explicit
 * caveat NAMING the unmet hard constraint(s) — without asserting them satisfied. On the full-coverage
 * path (`ctx.unmet` empty) it emits no coverage caveat. Citations are filtered mechanically at
 * `Verify`. Yields `answered`.
 */
export const RespondTrigger: QueryHandler = async function* (ctx) {
  const { project, request: req, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const log = loggerOf(project, "QueryFsm");
  const facts = ctx.facts;
  // Human-readable labels for the hard constraints no retrieved evidence satisfied (best-partial).
  const unmetLabels = ctx.unmet.map((c) =>
    c.kind === "predicate" ? c.text : c.tokens.join(" / "),
  );

  const { output: composed } = await timedGenerate(llm, log, progress, {
    name: "compose-answer",
    description:
      "Answer the prompt as individually-cited claims from the rolling section summaries, and report whether the evidence sufficed.",
    // The final answer uses the ADVANCED model; rolling summaries were extracted by the weak `queryFast`.
    model: cfg.modelFor("queryStrong"),
    system: COMPOSE_PROMPT,
    input: {
      question: req.question,
      language: ctx.intent.language,
      facts: facts.map((f) => ({ statement: f.statement, citations: f.citations })),
      unmetConstraints: unmetLabels,
    },
    inputSchema: composeInputSchema,
    outputSchema: composeSchema,
    strict: true,
    // Stream COMPLETED claims only (drop the in-progress last one) so each renders whole with its
    // citations — char-by-char citation streaming would garble the [[…]] wrappers.
    onPartial: (partial) => {
      const claims = (partial as { claims?: Parameters<typeof renderClaims>[0] }).claims ?? [];
      progress.setPartialText(renderClaims(claims.slice(0, -1)));
    },
  });

  await finalizeComposedAnswer(ctx, composed, unmetLabels);
  yield "answered";
};

/**
 * Assemble the composed output into the published `Answer`: keep only grounded claims (each carries
 * ≥1 citation), render them to text, attach caveats (dropped-ungrounded, best-partial unmet
 * constraints, and an incompleteness note), aggregate the evidence's topic/outlier classes, and set
 * `ctx.answer`. Shared by the strong-tier `Respond` and the cheap-tier `LeanRespond`.
 */
async function finalizeComposedAnswer(
  ctx: Parameters<QueryHandler>[0],
  composed: z.infer<typeof composeSchema>,
  unmetLabels: string[],
): Promise<void> {
  const grounded = composed.claims.filter((c) => c.citations.length > 0);
  const dropped = composed.claims.length - grounded.length;
  const caveats: string[] = [];
  if (dropped > 0) caveats.push(`${dropped} ungrounded claim(s) omitted.`);
  // Best-partial caveat: name the hard constraint(s) no retrieved evidence satisfied (D7 / §9.1).
  if (unmetLabels.length > 0) {
    caveats.push(`No retrieved evidence satisfied: ${unmetLabels.join("; ")}.`);
  }
  if (!composed.sufficient && composed.missing) {
    caveats.push(`Information may be incomplete: ${composed.missing}`);
  }
  // Flush the full grounded render (the streamed preview omitted the final claim).
  const text = renderClaims(grounded);
  ctx.progress.setPartialText(text);
  const { topics, outliers } = await aggregateClasses(ctx.project, ctx.evidence);
  ctx.setAnswer({
    text,
    citations: [...new Set(grounded.flatMap((c) => c.citations))],
    caveats,
    suggestions: composed.suggestions,
    topics,
    outliers,
    evidenceCount: ctx.evidence.length,
  });
}

/**
 * The lean single-pass compose (D3): compose the answer from the rolling summaries on the CHEAP tier
 * and judge sufficiency. A `sufficient` answer is delivered directly (→ `Verify`); an insufficient
 * one escalates into the abductive loop (→ `Hypothesize`), warm-started from the accumulated pool —
 * the composed draft is discarded and the strong-tier `Respond` recomposes at the end. No best-partial
 * caveat here: the lean path has no coverage gate, so no unmet constraints.
 */
export const LeanRespondTrigger: QueryHandler = async function* (ctx) {
  const { project, request: req, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const log = loggerOf(project, "QueryFsm");

  const { output: composed } = await timedGenerate(llm, log, progress, {
    name: "compose-answer",
    description:
      "Compose the lean answer from the rolling section summaries and judge whether the evidence sufficed.",
    // Cheap tier — the strong model is reserved for the escalated final compose.
    model: cfg.modelFor("queryFast"),
    system: COMPOSE_PROMPT,
    input: {
      question: req.question,
      language: ctx.intent.language,
      facts: ctx.facts.map((f) => ({ statement: f.statement, citations: f.citations })),
      unmetConstraints: [],
    },
    inputSchema: composeInputSchema,
    outputSchema: composeSchema,
    strict: true,
  });

  if (!composed.sufficient) {
    ctx.escalate();
    log.info("lean insufficient → escalate", { missing: composed.missing ?? undefined });
    yield "insufficient";
    return;
  }
  await finalizeComposedAnswer(ctx, composed, []);
  log.info("lean sufficient", {
    queryKind: ctx.intent.queryKind,
    citations: ctx.answer.citations.length,
  });
  yield "sufficient";
};

/** Mechanical citation filter: drop citations not resolving to retrieved evidence. Yields `verified`. */
export const VerifyTrigger: QueryHandler = async function* (ctx) {
  const answer = ctx.answer;
  const evidence = ctx.evidence;
  const { citations, caveats } = filterCitations(evidence, answer.citations);
  ctx.setAnswer({ ...answer, citations, caveats: [...answer.caveats, ...caveats] });
  yield "verified";
};

/** Terminal success: publish the composed answer onto `QueryProgress`. Yields `done`. */
export const ResponseTrigger: QueryHandler = async function* (ctx) {
  ctx.progress._finish(ctx.answer);
  yield "done";
};

/**
 * Terminal graceful failure: publish a no-evidence (on-corpus) or off-corpus
 * answer. Reached from `IntentDetection` (offCorpus) or `Score` (exhaustedEmpty —
 * exhausted with a zero-evidence-ever pool). Yields `done`.
 */
export const NegativeResponseTrigger: QueryHandler = async function* (ctx) {
  const intent = ctx.intent;
  const text = intent.onCorpus
    ? "No supporting evidence found."
    : intent.offCorpusReason
      ? `This question is outside the wiki's scope: ${intent.offCorpusReason}`
      : "This question is outside the wiki's scope.";
  ctx.progress._finish({
    text,
    citations: [],
    caveats: [],
    suggestions: [],
    topics: [],
    outliers: [],
    evidenceCount: 0,
  });
  yield "done";
};
