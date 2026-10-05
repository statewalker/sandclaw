import type { Project } from "@statewalker/workspace.core";
import type { Answer, EvidenceSection, QueryProgress } from "../progress.js";
import { orderEvidence, sectionId } from "./retrieval.js";

/**
 * Typed per-query state for the query FSM.
 *
 * FSM events carry no payload, so every datum crossing a state boundary lives on
 * this single context instance. `project` / `request` / `progress` are injected at
 * launch; per-query data is held in private, default-initialized fields that stages
 * read via getters and produce via the semantic methods below. Project-global
 * capabilities (LLM, wiki config) are NOT carried here — handlers reach them via
 * `llmOf(ctx.project)` / `wikiConfigOf(ctx.project)`.
 */

/** The user's query as supplied to `ask`. */
export interface QueryRequest {
  question: string;
  /** Optional retrieval scope: project-relative path prefixes both front-ends honour. */
  paths?: string[];
}

/** One distinct subject the prompt decomposes into, re-formulated for retrieval. */
export interface Subject {
  /** Standalone, vault-aligned reformulation of this subject; drives topic-class routing. */
  prompt: string;
  /** Distinctive English keywords for full-text search AND the (concatenated) vector query. */
  ftsQueries: string[];
}

/**
 * A hard constraint the answer must satisfy, extracted by `IntentDetection`.
 *
 * `entity` / `scope` constraints carry a token set checked MECHANICALLY against the
 * candidate's raw section text (the deterministic coverage gate — a constraint is
 * covered iff any of its tokens appears in the raw content). The `predicate`
 * constraint is an analytic judgement (e.g. "most costly") that does NOT gate — it
 * only ranks survivors via the LLM (advisory).
 */
export type HardConstraint =
  | { kind: "entity" | "scope"; tokens: string[] }
  | { kind: "predicate"; text: string };

/** The retrieval shape classified by `IntentDetection`. `synthesis` fast-forwards past the lean path. */
export type QueryKind = "lookup" | "synthesis";

/** IntentDetection output: on/off-corpus, the decomposed subjects, the hard constraints, and the request language. */
export interface IntentResult {
  onCorpus: boolean;
  subjects: Subject[];
  /** The prompt's hard constraints — feed both `Hypothesize` projection and the `Score` gate. */
  constraints: HardConstraint[];
  /** Retrieval shape — `synthesis` fast-forwards to the abductive loop; `lookup` runs the lean path. */
  queryKind: QueryKind;
  /** Why the prompt was judged off-corpus (when `onCorpus` is false). */
  offCorpusReason?: string;
  /** English name of the language the prompt is written in; the answer is composed in it. */
  language: string;
}

/**
 * A rival candidate ANSWER plus its projected probe. `Hypothesize` emits one per
 * pass; `Retrieve` is parameterised by its `searchCriteria` (D11 — the hypothesis
 * subsumes the subject as the search unit). `constraints` is the per-hypothesis
 * checklist carried from `IntentDetection`, possibly enriched with PROJECT synonyms.
 */
export interface Hypothesis {
  /** A rival candidate answer to the prompt. */
  claim: string;
  /** PROJECT: the predicted source vocabulary if this candidate were true. */
  searchCriteria: {
    /**
     * Literalised hard-constraint tokens + predicted answer words (ENGLISH). Drives full-text
     * search AND, space-joined, the vector query — both legs search the same terms.
     */
    ftsQueries: string[];
  };
  /** Coverage checklist (entity/scope token sets + predicate), incl. PROJECT synonyms. */
  constraints: HardConstraint[];
}

/** A grounded fact: a single-document statement plus the verbatim section refs it rests on. */
export interface GroundedFact {
  statement: string;
  citations: string[];
}

/**
 * A retrieved section before the rank-based pre-filter: the resolved evidence plus
 * its retrieval signal — `score` (how many front-ends surfaced it: 1, or 2 when both
 * hybrid search AND the topic ladder did) and `searchScore` (the best RRF-fused
 * hybrid-search score, 0 when only the topic ladder surfaced it). Retrieval is driven
 * by the current hypothesis's `searchCriteria` (D11), so no per-subject membership.
 */
export interface Candidate {
  section: EvidenceSection;
  score: number;
  searchScore: number;
}

const EMPTY_INTENT: IntentResult = {
  onCorpus: false,
  subjects: [],
  constraints: [],
  queryKind: "lookup",
  language: "English",
};
const EMPTY_ANSWER: Answer = {
  text: "",
  citations: [],
  caveats: [],
  suggestions: [],
  topics: [],
  outliers: [],
  evidenceCount: 0,
};

/** Default iteration budget — the small bound on abductive loop passes (D7). */
export const DEFAULT_ITERATION_BUDGET = 4;

/**
 * One pooled section: the resolved evidence + the raw section text the `Score` gate
 * checks token coverage against, accumulated across loop iterations.
 */
export interface PooledSection {
  section: EvidenceSection;
  /** The section's RAW content (line-sliced), the coverage gate's only source of truth. */
  raw: string;
}

export class QueryContext {
  constructor(
    readonly project: Project,
    readonly request: QueryRequest,
    readonly progress: QueryProgress,
  ) {}

  // ── per-query data (default-initialized; produced by a stage, read by later ones) ──
  #intent: IntentResult = EMPTY_INTENT;
  #candidates: Candidate[] = [];
  /** The evidence-section union (sections that produced a kept rolling summary). */
  #evidence: EvidenceSection[] = [];
  #facts: GroundedFact[] = [];
  #answer: Answer = EMPTY_ANSWER;

  // ── abductive-loop state (D5/D8) ──
  #hypothesis: Hypothesis | undefined;
  /** Evidence pool keyed by `${uri}#${sectionKey}` (= sectionId), persisting across iterations. */
  #pool = new Map<string, PooledSection>();
  #iteration = 0;
  /** Rival claims already pursued — so `Hypothesize` advances on re-entry. */
  #consumedRivals: string[] = [];
  /** Perimeter-expansion axes already spent on `narrow` re-entry of the current hypothesis. */
  #consumedAxes = new Set<string>();
  /** Whether the most recent `Retrieve` added a section new to the pool (doom-loop novelty). */
  #addedNewThisIteration = false;
  /** Unmet hard constraints reported by the last `Score` (drives the best-partial caveat). */
  #unmet: HardConstraint[] = [];

  // ── lean-first routing ──
  /** Whether the lean single-pass path is active. Set by `IntentDetection` when it routes to the
   * lean path; cleared on escalation so the shared `RollingSummarize` state routes to `Score`,
   * not `LeanRespond`. */
  #leanActive = false;
  /** Whether the lean pass escalated into the abductive loop (observability: predicted-vs-actual). */
  #escalated = false;

  get intent(): IntentResult {
    return this.#intent;
  }
  setIntent(intent: IntentResult): void {
    this.#intent = intent;
  }

  get candidates(): Candidate[] {
    return this.#candidates;
  }
  setCandidates(candidates: Candidate[]): void {
    this.#candidates = candidates;
  }

  /** The claim of the hypothesis the most recent `Retrieve` ran for (re-entry detection). */
  #lastRetrievedClaim: string | undefined;

  // ── hypothesis + iteration bookkeeping ──
  get hypothesis(): Hypothesis | undefined {
    return this.#hypothesis;
  }
  /** Adopt a fresh hypothesis (a new rival): set it, mark it consumed, reset its perimeter axes. */
  setHypothesis(h: Hypothesis): void {
    this.#hypothesis = h;
    this.#consumedRivals.push(h.claim);
    this.#consumedAxes = new Set<string>();
  }
  get consumedRivals(): readonly string[] {
    return this.#consumedRivals;
  }

  get iteration(): number {
    return this.#iteration;
  }
  /** Open a new loop iteration; clears the per-iteration novelty flag. Returns the new count. */
  nextIteration(): number {
    this.#iteration += 1;
    this.#addedNewThisIteration = false;
    return this.#iteration;
  }

  /**
   * Whether `Retrieve` is being re-entered for the SAME hypothesis (a `narrow` loop-back,
   * which must widen the perimeter) versus the first retrieval of a fresh hypothesis. Records
   * the current hypothesis as retrieved-for as a side effect.
   */
  beginRetrieveForCurrentHypothesis(): boolean {
    const claim = this.#hypothesis?.claim;
    const reentry = claim !== undefined && claim === this.#lastRetrievedClaim;
    this.#lastRetrievedClaim = claim;
    return reentry;
  }

  /** Whether the current hypothesis still has an unspent perimeter axis to widen along. */
  hasUnspentAxis(axes: readonly string[]): boolean {
    return axes.some((a) => !this.#consumedAxes.has(a));
  }
  /** Claim the next unspent perimeter axis (in priority order); mark it consumed. */
  consumeNextAxis(axes: readonly string[]): string | undefined {
    const axis = axes.find((a) => !this.#consumedAxes.has(a));
    if (axis) this.#consumedAxes.add(axis);
    return axis;
  }

  // ── evidence pool (D8) ──
  /** Add a section to the pool if `${uri}#${sectionKey}` is new; returns whether it was new. */
  poolAdd(section: EvidenceSection, raw: string): boolean {
    const id = sectionId(section.uri, section.sectionKey);
    if (this.#pool.has(id)) return false;
    this.#pool.set(id, { section, raw });
    this.#addedNewThisIteration = true;
    return true;
  }
  /** Whether `${uri}#${sectionKey}` is already pooled (skip-resummarize check). */
  poolHas(uri: string, sectionKey: string): boolean {
    return this.#pool.has(sectionId(uri, sectionKey));
  }
  get pool(): PooledSection[] {
    return [...this.#pool.values()];
  }
  get poolEmpty(): boolean {
    return this.#pool.size === 0;
  }
  /** Whether this iteration's `Retrieve` added at least one section new to the pool. */
  get addedNewThisIteration(): boolean {
    return this.#addedNewThisIteration;
  }

  get unmet(): HardConstraint[] {
    return this.#unmet;
  }
  setUnmet(unmet: HardConstraint[]): void {
    this.#unmet = unmet;
  }

  // ── lean-first routing ──
  /** Whether the lean single-pass path is currently active (drives `RollingSummarize` routing). */
  get leanActive(): boolean {
    return this.#leanActive;
  }
  /** Enter the lean single-pass path. */
  enterLean(): void {
    this.#leanActive = true;
  }
  /** Leave the lean path for the abductive loop (empty pool or an insufficient lean answer). */
  escalate(): void {
    this.#leanActive = false;
    this.#escalated = true;
    this.progress.escalated = true;
  }
  /** Whether the lean pass escalated into the abductive loop (observability). */
  get escalated(): boolean {
    return this.#escalated;
  }

  get evidence(): EvidenceSection[] {
    return this.#evidence;
  }
  /** Union `sections` into the accumulated, document-ordered evidence and keep `progress.evidence` in sync. */
  async addEvidence(sections: EvidenceSection[]): Promise<void> {
    this.#evidence = await orderEvidence(this.project, [...this.#evidence, ...sections]);
    this.progress.evidence = this.#evidence;
  }

  get facts(): GroundedFact[] {
    return this.#facts;
  }
  /** Append the rolling stage's fresh grounded facts to the accumulated list. */
  addFacts(facts: GroundedFact[]): void {
    this.#facts = [...this.#facts, ...facts];
  }

  get answer(): Answer {
    return this.#answer;
  }
  setAnswer(answer: Answer): void {
    this.#answer = answer;
  }
}
