---
status: accepted
---

# Topic-descent relevance scores stay internal to the topic front-end

The query stage scores each evidence section by **how many independent front-ends surfaced it** (found by both hybrid search and the topic front-end → tier 0; one → tier 1), and `SelectSections → Respond` escalates tier by tier. When the topic front-end is upgraded to scored DAG descent over the topic index, it produces its own per-node relevance scores (relevant = 2 / maybe = 1 / non-relevant = 0), and a section's intra-front-end score is the sum of the scores of the topics referencing it.

We decided those descent scores stay **internal** to the topic front-end — they prune the descent, threshold which sections it emits, and order them within the front-end — and are **not** promoted into the global section score. The global escalation axis remains cross-front-end overlap.

## Considered Options

- **Promote the summed-topic-score to a global graded section score** and redesign `SelectSections`/`Respond` escalation around continuous scores. Rejected: it conflates "many topics point here" (a within-the-topic-method signal) with "independently corroborated by different retrieval methods" (the precision signal that makes tier-0 trustworthy), double-counting and weakening the corroboration tier — and it is a larger, riskier change than shipping the front-end.

## Consequences

A future reader will see the topic front-end compute 0/1/2 scores that do **not** feed the global section score, and might assume that is a bug. It is deliberate: cross-front-end overlap stays the global signal; topic-descent scoring is a within-front-end concern.
