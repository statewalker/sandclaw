/**
 * Default stubs for the two abductive-loop LLM stages (`hypothesize`, `score`) so the
 * many existing query fixtures keep passing after the linear pipeline became a loop.
 *
 * `hypothesize` echoes the question as the candidate claim and projects the prompt's
 * hard-constraint tokens (plus the question) into `ftsQueries` — enough for retrieval to
 * behave exactly as the old linear first pass. `score` returns `narrow` (advisory only;
 * the mechanical gate decides covered/exhausted, so this is rarely reached in fixtures).
 */

interface HypothesizeInput {
  question: string;
  constraints: { kind: string; tokens: string[]; text: string }[];
  consumedRivals: string[];
}

/** The default `hypothesize` stub output: claim = question, probe = constraint tokens + question. */
export function stubHypothesize(input: HypothesizeInput) {
  const tokens = input.constraints.flatMap((c) => c.tokens);
  return {
    claim: input.question,
    ftsQueries: [...tokens, input.question],
    semanticQuery: input.question,
    synonyms: [] as string[],
  };
}

/** The default `score` stub output: advisory `narrow` (kept-hypothesis, widen-search). */
export function stubScore() {
  return { failureMode: "narrow" as const };
}
