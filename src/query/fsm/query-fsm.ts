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
  | "Retrieve"
  // | "SelectSections"  // relevance filter DISABLED (retained in handlers.ts for re-activation)
  | "RollingSummarize"
  | "Respond"
  | "Verify"
  | "Response"
  | "NegativeResponse";

/**
 * The query pipeline as a flat Finite State Machine.
 *
 * `IntentDetection → Retrieve → RollingSummarize → Respond → Verify → Response`,
 * with `NegativeResponse` reachable from `IntentDetection` (off-corpus), `Retrieve`
 * (no candidates), and `RollingSummarize` (no relevant summary kept). The relevance
 * filter (`SelectSections`) is DISABLED — its handler is retained in `handlers.ts`;
 * to re-enable, route `Retrieve→SelectSections→RollingSummarize` and restore its state.
 *
 * Retrieval runs two front-ends in parallel inside the `Retrieve` handler — the
 * mechanical hybrid (FTS + vector) search and the LLM topic/doc-topic class
 * ladder — merged into one evidence pool; the per-subject fan-out is
 * handler-internal so the topology is fixed regardless of subject count. There
 * is a single pipeline, so no pluggable `Route`/`Pipelines` composite.
 *
 * A wildcard `["*", "error", ""]` transition terminates from ANY state: when a
 * stage throws, `guarded` (in `load.ts`) records the failure on `QueryProgress`
 * and yields `error`, exiting all sub-states and ending the process declaratively
 * (no imperative engine `terminate` call).
 *
 * Validated by `@statewalker/fsm-validator` (0 errors / 0 warnings) — see
 * `tests/fsm/query-fsm.validate.test.ts`.
 */
export const QUERY_FSM: FsmStateConfig = {
  key: "Query",
  description:
    "Answer a question against the project's LLM-curated wiki via an FSM-driven retrieval pipeline.",
  transitions: [
    ["", "*", "IntentDetection"],
    ["*", "error", ""],
    ["IntentDetection", "onCorpus", "Retrieve"],
    ["IntentDetection", "offCorpus", "NegativeResponse"],
    // Relevance filter disabled: retrieved candidates go straight to rolling summarization.
    ["Retrieve", "gathered", "RollingSummarize"],
    ["Retrieve", "empty", "NegativeResponse"],
    ["RollingSummarize", "summarized", "Respond"],
    ["RollingSummarize", "empty", "NegativeResponse"],
    ["Respond", "answered", "Verify"],
    ["Verify", "verified", "Response"],
    ["Response", "done", ""],
    ["NegativeResponse", "done", ""],
  ],
  states: [
    {
      key: "IntentDetection",
      description: "Classify on/off-corpus and decompose the prompt into distinct search subjects.",
      events: {
        onCorpus: "The prompt concerns the vault's domain.",
        offCorpus: "The prompt is out of scope.",
      },
    },
    {
      key: "Retrieve",
      description:
        "Per subject, run hybrid search and the topic/doc-topic class ladder; merge into one evidence pool.",
      events: {
        gathered: "At least one evidence section was retrieved.",
        empty: "No relevant evidence anywhere.",
      },
    },
    {
      key: "RollingSummarize",
      description:
        "Conditional rolling summarization over ALL retrieved candidates (cheap model): each section's raw content is summarized against the prompt; non-relevant sections are skipped.",
      events: {
        summarized: "At least one prompt-relevant section summary was kept.",
        empty: "No candidate section carried anything relevant to the prompt.",
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
