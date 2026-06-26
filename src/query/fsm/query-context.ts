import type { Project } from "@statewalker/workspace.core";
import type { Answer, EvidenceSection, QueryProgress } from "../progress.js";
import { orderEvidence } from "./retrieval.js";

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
  /** Hypothetical answer to the subject (HyDE); embedded for semantic (vector) search. */
  semanticQuery: string;
  /** Distinctive keywords for full-text search (content terms + named entities, not phrases). */
  ftsQueries: string[];
}

/** IntentDetection output: on/off-corpus, the decomposed subjects, and the request language. */
export interface IntentResult {
  onCorpus: boolean;
  subjects: Subject[];
  /** Why the prompt was judged off-corpus (when `onCorpus` is false). */
  offCorpusReason?: string;
  /** English name of the language the prompt is written in; the answer is composed in it. */
  language: string;
}

/** A grounded fact: a single-document statement plus the verbatim section refs it rests on. */
export interface GroundedFact {
  statement: string;
  citations: string[];
}

/**
 * A retrieved section before the relevance filter: the resolved evidence plus its
 * retrieval signal — `score` (how many front-ends surfaced it: 1, or 2 when both
 * hybrid search AND the topic ladder did), `searchScore` (the best RRF-fused hybrid-search
 * score, 0 when only the topic ladder surfaced it), and the subject indices it served.
 */
export interface Candidate {
  section: EvidenceSection;
  score: number;
  searchScore: number;
  subjects: number[];
}

const EMPTY_INTENT: IntentResult = { onCorpus: false, subjects: [], language: "English" };
const EMPTY_ANSWER: Answer = {
  text: "",
  citations: [],
  caveats: [],
  suggestions: [],
  topics: [],
  outliers: [],
  evidenceCount: 0,
};

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
