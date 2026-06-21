---
status: accepted
---

# Grounded facts are atomic and single-document

Query answers were hallucinating by conflating sections from different documents: the query-side summarize stage rendered a batch of retrieved sections with no document provenance and blended them into one summary, so compose faithfully cited a fact that was synthesised across two documents.

We decided the summarize stage emits **grounded facts** — `{ statement, citations }` — instead of prose, with these mechanically-enforced rules: every fact carries ≥1 verbatim section citation; a fact with no valid citation is dropped; and **all of a fact's citations must belong to the same document**. A fact whose valid citations span two documents is dropped. Cross-document corroboration is therefore impossible to express *as a fact* — it happens one stage later, where a compose `claim` may rest on grounded facts from several documents, each independently cited (and `Verify` still filters citations mechanically).

## Considered Options

- **Prompt-only grounding** (keep prose summaries; add a "don't merge across documents" instruction). Rejected: a prose convention is leaky — the model can still blend, and there is no structural check; conflation is exactly what we must make impossible, not merely discouraged.

## Consequences

A future reader will see the summarize stage produce atomic cited facts and **drop** any fact spanning two documents, and may assume that loses information. It is deliberate: single-document atomicity is what makes cross-document conflation structurally impossible at summarize time; legitimate cross-document synthesis is recovered at compose, where it is citation-gated.
