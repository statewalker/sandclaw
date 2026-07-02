import { loggerOf } from "@statewalker/workspace.core";
import {
  HypothesizeTrigger,
  IntentDetectionTrigger,
  LeanRespondTrigger,
  LeanRetrieveTrigger,
  NegativeResponseTrigger,
  RespondTrigger,
  ResponseTrigger,
  RetrieveTrigger,
  RollingSummarizeTrigger,
  ScoreTrigger,
  SelectSectionsTrigger,
  VerifyTrigger,
} from "./handlers.js";
import type { Ctx, QueryHandler, QueryStateKey } from "./query-fsm.js";

/**
 * Exhaustive handler map. The `Record<QueryStateKey, …>` makes a missing handler
 * a COMPILE error (no silent runtime no-op). The composite root (`Query`) has no
 * handler — it routes via its initial transition.
 */
const HANDLERS: Record<QueryStateKey, QueryHandler | undefined> = {
  Query: undefined,
  IntentDetection: IntentDetectionTrigger,
  LeanRetrieve: LeanRetrieveTrigger,
  LeanRespond: LeanRespondTrigger,
  Hypothesize: HypothesizeTrigger,
  Retrieve: RetrieveTrigger,
  SelectSections: SelectSectionsTrigger,
  RollingSummarize: RollingSummarizeTrigger,
  Score: ScoreTrigger,
  Respond: RespondTrigger,
  Verify: VerifyTrigger,
  Response: ResponseTrigger,
  NegativeResponse: NegativeResponseTrigger,
};

/** Map FSM states to the observable `QueryProgress` stage names. Terminals publish directly. */
const STAGE_FOR: Partial<Record<QueryStateKey, string>> = {
  IntentDetection: "intent",
  LeanRetrieve: "lean-retrieve",
  LeanRespond: "lean-respond",
  Hypothesize: "hypothesize",
  Retrieve: "retrieve",
  SelectSections: "select-sections",
  RollingSummarize: "rolling-summarize",
  Score: "score",
  Respond: "respond",
  Verify: "verify",
};

/** Record a `QueryProgress` stage per mapped FSM state (running on enter, done on exit). */
function instrument(stateKey: QueryStateKey): QueryHandler {
  return (ctx) => {
    const name = STAGE_FOR[stateKey];
    if (!name) return;
    const { progress } = ctx;
    progress.stage(name);
    return () => progress.finishStage();
  };
}

/**
 * Wrap a trigger so a thrown (network/schema) failure becomes a terminal failure.
 * `startProcess` swallows generator errors, so catching here is what rejects
 * `complete()` (via `_fail`) and stops the machine instead of stalling.
 */
function guarded(stateKey: QueryStateKey, handler: QueryHandler): QueryHandler {
  return async function* (ctx) {
    try {
      const result = handler(ctx);
      if (result && typeof result === "object" && Symbol.asyncIterator in (result as object)) {
        yield* result as AsyncGenerator<string>;
      }
    } catch (error) {
      loggerOf(ctx.project, "QueryFsm").error("stage failed", {
        state: stateKey,
        error: error instanceof Error ? error.message : String(error),
      });
      ctx.progress._fail(error);
      // Terminate declaratively: the wildcard ["*", "error", ""] transition exits
      // all sub-states and ends the process (no imperative engine terminate call).
      yield "error";
    }
  };
}

/**
 * Explicit, typed loader for `startProcess`: prepend instrumentation to each state
 * and append its guarded handler (if any). No `HandlerRegistry` pattern discovery.
 */
export function load(state: string): QueryHandler[] {
  const key = state as QueryStateKey;
  const mods: QueryHandler[] = [instrument(key)];
  const handler = HANDLERS[key];
  if (handler) mods.push(guarded(key, handler));
  return mods;
}

export type { Ctx };
