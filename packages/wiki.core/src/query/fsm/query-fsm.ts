import type { FsmStateConfig, StageHandler } from "@statewalker/fsm";
import type { QueryContext } from "./query-context.js";

/** The typed per-query process context. */
export type Ctx = QueryContext;

/** A query-pipeline state handler: a one-shot Trigger yielding one event. */
export type QueryHandler = StageHandler<QueryContext>;

/**
 * Every state key in the query FSM. The handler `load` map is keyed by this
 * union so the compiler guarantees exhaustive coverage — a missing handler is
 * a type error, never a silent runtime no-op.
 */
export type QueryStateKey =
  | "Query"
  | "IntentDetection"
  | "LeanRetrieve"
  | "LeanRespond"
  | "Hypothesize"
  | "Retrieve"
  | "SelectSections"
  | "RollingSummarize"
  | "Score"
  | "Respond"
  | "Verify"
  | "Response"
  | "NegativeResponse";

/**
 * The query pipeline as a lean-first path with an abductive retrieval LOOP behind it.
 *
 * Under `lean-first` (default), `IntentDetection` routes an on-corpus `lookup` query into the LEAN
 * single-pass path `LeanRetrieve → SelectSections → RollingSummarize → LeanRespond` (hybrid search
 * only, cheap compose). `LeanRespond` delivers the answer when `sufficient`, else escalates to
 * `Hypothesize` (warm-started from the pool); an empty lean pool short-circuits straight to
 * `Hypothesize`. A `synthesis` query (or `full-only` mode) skips the lean path and enters the loop
 * directly. `SelectSections` and `RollingSummarize` are SHARED by both paths (the lean pass emits
 * `summarizedLean` → `LeanRespond`; the full path emits `summarized` → `Score`).
 *
 * The abductive loop is
 * `Hypothesize → Retrieve → SelectSections → RollingSummarize → Score`,
 * where `Score` (a mechanical coverage GATE with a folded controller) routes one of four
 * outcomes: `covered → Respond` (success), `narrow → Retrieve` (same hypothesis, widened
 * perimeter), `contradicted → Hypothesize` (next rival), and on exhaustion either
 * `exhausted → Respond` (best-partial over the non-empty pool) or
 * `exhaustedEmpty → NegativeResponse` (zero evidence ever). `IntentDetection → offCorpus`
 * is the other path to `NegativeResponse`.
 *
 * `Hypothesize` (GEN) projects the single most-promising rival candidate answer into a
 * `searchCriteria` probe BEFORE retrieving (abductive-always, D9). `Retrieve` is
 * parameterised by the CURRENT hypothesis's `searchCriteria` (D11), runs its two
 * front-ends (hybrid FTS+vector search + the topic/doc-topic class ladder) internally,
 * and accumulates sections into a cross-iteration evidence pool. `Score` (GATE) checks
 * hard-constraint coverage MECHANICALLY against pooled raw text; the analytic predicate
 * is an advisory LLM rank, never a gate (D6).
 *
 * Per-iteration empties no longer terminate: a `Retrieve`/`SelectSections`/`RollingSummarize`
 * iteration that finds nothing is a zero-coverage input flowing forward into `Score`'s
 * controller (D10) — so those states emit a single forward event regardless of count.
 *
 * A wildcard `["*", "error", ""]` transition terminates from ANY state: when a
 * stage throws, `guarded` (in `load.ts`) records the failure on `QueryProgress`
 * and yields `error`, exiting all sub-states and ending the process declaratively
 * (no imperative engine `terminate` call).
 *
 * Validated by `@statewalker/fsm-validator` (0 errors / 0 warnings) — see
 * `tests/fsm/query-fsm.validate.test.ts`. (`covered`/`exhausted` both target `Respond`,
 * an M4 "review" advisory — semantically intended: both compose an answer.)
 */
export const QUERY_FSM: FsmStateConfig = {
  key: "Query",
  description:
    "Answer a question against the project's LLM-curated wiki via an abductive hypothesis-driven retrieval loop.",
  transitions: [
    ["", "*", "IntentDetection"],
    ["*", "error", ""],
    // Lean-first (default): a `lookup` query runs the lean single-pass path; a `synthesis` query (or
    // `full-only` mode) fast-forwards to the abductive loop; off-corpus goes to NegativeResponse.
    ["IntentDetection", "lean", "LeanRetrieve"],
    ["IntentDetection", "abductive", "Hypothesize"],
    ["IntentDetection", "offCorpus", "NegativeResponse"],
    ["LeanRetrieve", "retrieved", "SelectSections"],
    // Empty lean pool: skip the compose, escalate straight into the abductive loop.
    ["LeanRetrieve", "empty", "Hypothesize"],
    ["LeanRespond", "sufficient", "Verify"],
    // Insufficient lean answer: escalate into the abductive loop (warm-started from the pool).
    ["LeanRespond", "insufficient", "Hypothesize"],
    ["Hypothesize", "hypothesized", "Retrieve"],
    ["Retrieve", "retrieved", "SelectSections"],
    ["SelectSections", "selected", "RollingSummarize"],
    // Shared `RollingSummarize`: on the lean pass it routes to `LeanRespond`; on the full path to `Score`.
    ["RollingSummarize", "summarizedLean", "LeanRespond"],
    ["RollingSummarize", "summarized", "Score"],
    ["Score", "covered", "Respond"],
    ["Score", "narrow", "Retrieve"],
    ["Score", "contradicted", "Hypothesize"],
    ["Score", "exhausted", "Respond"],
    ["Score", "exhaustedEmpty", "NegativeResponse"],
    ["Respond", "answered", "Verify"],
    ["Verify", "verified", "Response"],
    ["Response", "done", ""],
    ["NegativeResponse", "done", ""],
  ],
  states: [
    {
      key: "IntentDetection",
      description:
        "Classify on/off-corpus, decompose the prompt into subjects, extract the hard-constraint set, and classify the query kind (lookup vs synthesis) to route lean-first vs abductive.",
      events: {
        lean: "On-corpus lookup query under lean-first → run the lean single-pass path.",
        abductive: "Synthesis query (or full-only mode) → enter the abductive loop directly.",
        offCorpus: "The prompt is out of scope.",
      },
    },
    {
      key: "LeanRetrieve",
      description:
        "Lean retrieval: hybrid search only (no topic descent), seeded mechanically from the intent subjects. Pools sections for the shared SelectSections/RollingSummarize states.",
      events: {
        retrieved: "The lean hybrid search returned one or more candidate sections.",
        empty: "The lean hybrid search found nothing → escalate straight to Hypothesize.",
      },
    },
    {
      key: "LeanRespond",
      description:
        "Compose the lean answer on the cheap tier and judge sufficiency: sufficient → deliver; insufficient → escalate into the abductive loop, warm-started from the pool.",
      events: {
        sufficient: "The lean answer suffices → verify and publish.",
        insufficient: "The lean answer is insufficient → escalate to Hypothesize.",
      },
    },
    {
      key: "Hypothesize",
      description:
        "Generate the single most-promising rival candidate answer and project it into a searchCriteria probe (cheap model). Re-entered to produce the next rival on rejection.",
      events: {
        hypothesized: "A hypothesis with searchCriteria was projected.",
      },
    },
    {
      key: "Retrieve",
      description:
        "Drive hybrid search and the topic/doc-topic class ladder by the current hypothesis's searchCriteria; accumulate new sections into the cross-iteration evidence pool.",
      events: {
        retrieved:
          "The iteration's retrieval completed (zero or more sections; empties flow to Score).",
      },
    },
    {
      key: "SelectSections",
      description:
        "Mechanical rank-based pre-filter narrowing the retrieved candidates before rolling summarization.",
      events: {
        selected: "The pre-filter completed (zero or more survivors; empties flow to Score).",
      },
    },
    {
      key: "RollingSummarize",
      description:
        "Conditional rolling summarization over the filtered candidates (cheap model): each NEW section's raw content is summarized against the prompt; already-pooled and non-relevant sections are skipped.",
      events: {
        summarized: "Summarization completed (zero or more kept summaries; empties flow to Score).",
        summarizedLean: "Lean-pass summarization completed → compose the lean answer.",
      },
    },
    {
      key: "Score",
      description:
        "Mechanical coverage GATE with the folded loop controller (cheap model for advisory classification only): coverage-first ordering emits covered / exhausted / exhaustedEmpty / narrow / contradicted.",
      events: {
        covered: "Every hard constraint is covered by a pooled section → compose cleanly.",
        narrow:
          "Hypothesis plausible but search too narrow → re-retrieve with an expanded perimeter.",
        contradicted: "Evidence refutes the hypothesis → reject and generate the next rival.",
        exhausted: "Budget/doom-loop/no-axis-or-rival with a non-empty pool → best-partial answer.",
        exhaustedEmpty: "Exhausted with an empty evidence pool → negative response.",
      },
    },
    {
      key: "Respond",
      description: "Compose the grounded, cited answer from the rolling summaries (strong model).",
      events: {
        answered: "Answer composed from the grounded summaries.",
      },
    },
    {
      key: "Verify",
      description: "Mechanically keep only citations that resolve to retrieved evidence.",
      events: { verified: "Citations verified." },
    },
    {
      key: "Response",
      description: "Publish the cited answer.",
      events: { done: "Answer published." },
    },
    {
      key: "NegativeResponse",
      description: "Publish a no-evidence / off-corpus answer.",
      events: { done: "Negative response published." },
    },
  ],
};
