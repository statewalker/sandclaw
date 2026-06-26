import { loggerOf, type Project } from "@statewalker/workspace.core";
import { WikiTopicIndex } from "../../knowledge/indexes.js";
import { WikiPageSummary } from "../../knowledge/page-adapters.js";
import type { DocumentMeta } from "../../knowledge/types.js";
import { type LlmApi, llmOf, type WikiLlmConfiguration, wikiConfigOf } from "../../llm/index.js";
import { SearchAdapter } from "../../search/index.js";
import { mapLimit } from "../../util/batch.js";
import type { EvidenceSection, QueryProgress } from "../progress.js";
import { logBatchTotals, timedGenerate } from "./llm-call.js";
import {
  COMPOSE_PROMPT,
  INTENT_DETECTION_PROMPT,
  ROLLING_SUMMARIZE_PROMPT,
  SECTION_SELECT_PROMPT,
  TOPIC_SELECT_PROMPT,
} from "./prompts.js";
import type { Candidate, GroundedFact, Subject, SubjectGroup } from "./query-context.js";
import type { QueryHandler } from "./query-fsm.js";
import {
  aggregateClasses,
  buildDocTopicCandidates,
  buildRollingBatches,
  evidenceFor,
  type FilterSection,
  filterCitations,
  hybridSearch,
  orderEvidence,
  packFilterBatches,
  readClassIndexes,
  sectionId,
  withinScope,
} from "./retrieval.js";
import {
  composeInputSchema,
  composeSchema,
  intentDetectionInputSchema,
  intentDetectionSchema,
  rollingSummarizeInputSchema,
  rollingSummarizeSchema,
  sectionFilterInputSchema,
  sectionFilterSchema,
  topicSelectInputSchema,
  topicSelectSchema,
} from "./schemas.js";
import { topicDescent } from "./topic-descent.js";

/** Char budget per relevance-filter batch (token-window proxy at ~4 chars/token). */
const FILTER_CHAR_BUDGET = 16_000;

/** Char budget for one rolling-summarization batch's `<sources>` payload (raw content + scaffolding). */
const ROLLING_CHAR_BUDGET = 20_000;
/** Max rolling-summarization calls in flight at once. */
const ROLLING_CONCURRENCY = 5;

/**
 * Retrieval-score ladder used by the (currently disabled) relevance filter: tier 0 = sections
 * found by BOTH front-ends (the high-confidence intersection), tier 1 = the single-front-end
 * remainder. Retained for re-activating `SelectSections`.
 */
const TIER_SCORES = [2, 1] as const;

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

  // Normalize each subject: fall back to its prompt for an omitted semanticQuery or empty
  // keyword list. Recall-first: an on-corpus prompt with no subjects becomes the whole question.
  const subjects: Subject[] = (
    output.onCorpus && output.subjects.length === 0
      ? [{ prompt: req.question, semanticQuery: req.question, ftsQueries: [req.question] }]
      : output.subjects
  ).map((s) => ({
    prompt: s.prompt,
    semanticQuery: s.semanticQuery?.trim() ? s.semanticQuery : s.prompt,
    ftsQueries: s.ftsQueries?.length ? s.ftsQueries : [s.prompt],
  }));
  ctx.setIntent({
    onCorpus: output.onCorpus,
    subjects: output.onCorpus ? subjects : [],
    offCorpusReason: output.offCorpusReason ?? undefined,
    // The answer is composed in the request's language; English when undetectable.
    language: output.language?.trim() || "English",
  });
  yield output.onCorpus ? "onCorpus" : "offCorpus";
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
 * Per subject (handler-internal fan-out, parallel), run hybrid search and the class
 * ladder; merge their candidate sections into one evidence pool deduped by
 * `(uri, sectionKey)`. Sets `ctx.candidates`; yields `gathered` | `empty`.
 */
export const RetrieveTrigger: QueryHandler = async function* (ctx) {
  const { project, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const { subjects } = ctx.intent;
  const paths = ctx.request.paths;
  const search = project.getAdapter(SearchAdapter);
  const log = loggerOf(project, "QueryFsm");
  const metaCache = new Map<string, DocumentMeta | undefined>();

  // Per unique section, track which front-ends surfaced it (→ score) and which
  // subjects it served (→ summary grouping). Both front-ends ⇒ a stronger signal.
  const signal = new Map<
    string,
    { uri: string; sectionKey: string; fronts: Set<string>; subjects: Set<number> }
  >();
  const record = (hits: { uri: string; sectionKey: string }[], front: string, subject: number) => {
    for (const h of hits) {
      const id = sectionId(h.uri, h.sectionKey);
      const e = signal.get(id) ?? {
        uri: h.uri,
        sectionKey: h.sectionKey,
        fronts: new Set<string>(),
        subjects: new Set<number>(),
      };
      e.fronts.add(front);
      e.subjects.add(subject);
      signal.set(id, e);
    }
  };
  await Promise.all(
    subjects.map(async (subject, i) => {
      const [searchHits, ladderHits] = await Promise.all([
        search ? hybridSearch(search, log, subject, paths) : Promise.resolve([]),
        classLadder(project, llm, cfg, progress, subject.prompt, metaCache),
      ]);
      record(searchHits, "search", i);
      // The topic ladder descends to whole documents; keep only in-scope sections so
      // the scope restricts both front-ends, not just hybrid search.
      record(
        ladderHits.filter((h) => withinScope(h.uri, paths)),
        "ladder",
        i,
      );
    }),
  );

  // Resolve evidence once per unique section; attach score + subject membership.
  const entries = [...signal.values()];
  const resolved = await Promise.all(entries.map((e) => evidenceFor(project, e.uri, e.sectionKey)));
  const candidates: Candidate[] = [];
  entries.forEach((e, i) => {
    const section = resolved[i];
    if (section) candidates.push({ section, score: e.fronts.size, subjects: [...e.subjects] });
  });

  ctx.setCandidates(candidates);
  // The escalation accumulators (tier/evidence/summaries) start from their QueryContext
  // defaults; Retrieve runs once before the SelectSections → Respond loop, so no reset.
  progress.evidence = candidates.map((c) => c.section);
  // Collect the section keys retrieved per document so the log shows exactly which
  // sections were found, not just a count.
  const perDoc = new Map<string, string[]>();
  for (const c of candidates) {
    const keys = perDoc.get(c.section.uri) ?? [];
    keys.push(c.section.sectionKey);
    perDoc.set(c.section.uri, keys);
  }
  log.info("retrieved evidence", {
    subjects: subjects.length,
    sections: candidates.length,
    documents: perDoc.size,
    // One entry per document: `["<n>× <uri>", ...sectionKeys]`, most-covered document first.
    sectionsPerDoc: [...perDoc.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([uri, keys]) => [`${keys.length}× ${uri}`, ...keys]),
  });
  yield candidates.length > 0 ? "gathered" : "empty";
};

/**
 * The relevance filter over a candidate set: order by score (both-front-end first),
 * pack document-grouped into token-bounded batches, and run one lightweight-model
 * filter call per batch IN PARALLEL. Returns the surviving candidates (those whose
 * URI a batch echoed back).
 */
async function filterByRelevance(
  project: Project,
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  progress: QueryProgress,
  question: string,
  candidates: Candidate[],
): Promise<Candidate[]> {
  if (candidates.length === 0) return [];
  const byId = new Map(candidates.map((c) => [sectionId(c.section.uri, c.section.sectionKey), c]));

  // Document titles for the doc-grouped filter input (one read per document).
  const docTitle = new Map<string, string>();
  for (const uri of new Set(candidates.map((c) => c.section.uri))) {
    const summary = await (await project.getProjectResource(uri))
      ?.getAdapter(WikiPageSummary)
      ?.get();
    docTitle.set(uri, summary?.title ?? uri);
  }

  // High-signal documents (best section score) first; keep each document contiguous.
  const docMax = new Map<string, number>();
  for (const c of candidates) {
    docMax.set(c.section.uri, Math.max(docMax.get(c.section.uri) ?? 0, c.score));
  }
  const ordered = [...candidates].sort(
    (a, b) =>
      (docMax.get(b.section.uri) ?? 0) - (docMax.get(a.section.uri) ?? 0) ||
      a.section.uri.localeCompare(b.section.uri) ||
      b.score - a.score,
  );
  const filterSections: FilterSection[] = ordered.map((c) => ({
    uri: sectionId(c.section.uri, c.section.sectionKey),
    docUri: c.section.uri,
    docTitle: docTitle.get(c.section.uri) ?? c.section.uri,
    title: c.section.title,
    summary: c.section.summary,
  }));
  const batches = packFilterBatches(filterSections, FILTER_CHAR_BUDGET);

  const log = loggerOf(project, "QueryFsm");
  const model = cfg.modelFor("queryFast");
  const startedAt = Date.now();
  const results = await Promise.all(
    batches.map((documents, i) =>
      timedGenerate(
        llm,
        log,
        progress,
        {
          name: "section-select",
          description:
            "Keep only the candidate sections in this batch that could answer the prompt.",
          model,
          system: SECTION_SELECT_PROMPT,
          input: {
            question,
            documents: documents.map((d) => ({ title: d.title, sections: d.sections })),
          },
          inputSchema: sectionFilterInputSchema,
          outputSchema: sectionFilterSchema,
          strict: true,
        },
        { batch: i + 1, of: batches.length },
      ),
    ),
  );
  logBatchTotals(
    log,
    "section-select",
    model,
    startedAt,
    results.map((r) => r.usage),
  );
  const selected = new Set(
    results.flatMap((r) => r.output.relevantUris).filter((uri) => byId.has(uri)),
  );
  return candidates.filter((c) => selected.has(sectionId(c.section.uri, c.section.sectionKey)));
}

/**
 * Consume the next escalation tier (score 2 first, then score 1), relevance-filter
 * its candidates, group the survivors by subject, and APPEND them to the running
 * evidence union — `ctx.groups` carries only THIS tier's delta for Summarize to
 * fold. Skips empty tiers. Yields `selected` (a tier was consumed) or `empty` (no
 * candidate anywhere). Re-entered from Respond when more evidence is needed.
 */
export const SelectSectionsTrigger: QueryHandler = async function* (ctx) {
  const { project, request: req, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const { subjects } = ctx.intent;
  const candidates = ctx.candidates;

  // Advance to the next tier that actually has candidates (no LLM call for empty tiers).
  let tierCands: Candidate[] = [];
  while (ctx.tier < TIER_SCORES.length) {
    const cands = candidates.filter((c) => c.score === TIER_SCORES[ctx.tier]);
    ctx.advanceTier();
    if (cands.length > 0) {
      tierCands = cands;
      break;
    }
  }
  const tier = ctx.tier;

  if (tierCands.length === 0) {
    // No further candidates. Keep prior evidence (if any) for a best-effort answer.
    ctx.setGroups([]);
    const total = ctx.evidence.length;
    loggerOf(project, "QueryFsm").info("selected sections", { tier, added: 0, total });
    yield total > 0 ? "selected" : "empty";
    return;
  }

  const survivors = await filterByRelevance(project, llm, cfg, progress, req.question, tierCands);

  // Group THIS tier's survivors by the subject(s) that retrieved them (the delta).
  const bySubject = new Map<number, EvidenceSection[]>();
  for (const c of survivors) {
    for (const s of c.subjects) {
      const list = bySubject.get(s) ?? [];
      list.push(c.section);
      bySubject.set(s, list);
    }
  }
  const groups: SubjectGroup[] = [];
  for (const [i, sections] of [...bySubject.entries()].sort((a, b) => a[0] - b[0])) {
    const prompt = subjects[i]?.prompt;
    if (!prompt || sections.length === 0) continue;
    groups.push({ prompt, sections: await orderEvidence(project, sections) });
  }
  ctx.setGroups(groups);

  // Accumulate the selected union across tiers (drives topics + citation verify);
  // addEvidence re-orders the union and keeps progress.evidence in sync.
  await ctx.addEvidence(survivors.map((c) => c.section));
  loggerOf(project, "QueryFsm").info("selected sections", {
    tier,
    tierCandidates: tierCands.length,
    added: survivors.length,
    total: ctx.evidence.length,
    subjects: groups.length,
  });
  yield "selected";
};

/**
 * Conditional rolling summarization: over ALL retrieved candidate sections (the relevance filter
 * is disabled), render each leaf's raw content within its ancestor TOC path, grouped by document
 * (each batch repeats the document summary), and in a SEPARATE call per batch (≤ ROLLING_CONCURRENCY
 * in parallel, cheap model) summarize each section AGAINST the prompt. A section with nothing
 * relevant is skipped — no entry, no citation. Each kept summary becomes a single-section grounded
 * "fact" ({ statement: summary, citations: [sectionRef] }); the sections that produced one form the
 * evidence. Yields `summarized` when at least one summary was kept, else `empty`.
 */
export const RollingSummarizeTrigger: QueryHandler = async function* (ctx) {
  const { project, request: req, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const log = loggerOf(project, "QueryFsm");

  const candidateSections = ctx.candidates.map((c) => c.section);
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
  await ctx.addEvidence(results.flatMap((r) => r.kept));
  const total = ctx.facts.length;
  log.info("rolling summaries", { kept: total, sections: ctx.evidence.length });
  yield total > 0 ? "summarized" : "empty";
};

/**
 * Compose the grounded, cited answer from the rolling section summaries (strong model). Keeps only
 * grounded claims; when the model reports the evidence is incomplete it attaches a caveat naming
 * what's missing (no escalation — the relevance filter and its retrieval tiers are disabled).
 * Citations are filtered mechanically at `Verify`. Yields `answered`.
 */
export const RespondTrigger: QueryHandler = async function* (ctx) {
  const { project, request: req, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const log = loggerOf(project, "QueryFsm");
  const facts = ctx.facts;
  const evidence = ctx.evidence;

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

  // Keep only grounded claims (each carries ≥1 citation); render them to the answer text.
  const grounded = composed.claims.filter((c) => c.citations.length > 0);
  const dropped = composed.claims.length - grounded.length;
  const caveats: string[] = [];
  if (dropped > 0) caveats.push(`${dropped} ungrounded claim(s) omitted.`);
  if (!composed.sufficient && composed.missing) {
    caveats.push(`Information may be incomplete: ${composed.missing}`);
  }
  // Flush the full grounded render (the streamed preview omitted the final claim).
  const text = renderClaims(grounded);
  progress.setPartialText(text);
  const { topics, outliers } = await aggregateClasses(project, evidence);
  ctx.setAnswer({
    text,
    citations: [...new Set(grounded.flatMap((c) => c.citations))],
    caveats,
    suggestions: composed.suggestions,
    topics,
    outliers,
    evidenceCount: evidence.length,
  });
  yield "answered";
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
 * answer. Reached from `IntentDetection` (offCorpus) or `Retrieve` (empty).
 * Yields `done`.
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
