---
status: accepted
---

# Section graphs are re-activated and consumed as the authoritative query evidence

The per-section graph stage (`graphBuilder` — entities + `[subject,predicate,object]`
statements/relations) was implemented and tested but **disabled** at registration
because "its per-section `graph.json` is a leaf artifact that nothing downstream
consumes." We re-activate it and give it a consumer.

## Decision

- **Build side.** One **Section graph** per section, built at indexation from the
  section's **title + summary + raw content** together (not summary-only as the
  disabled builder did). Feeding both gives the extractor the summary's headline
  framing *and* the raw text's authoritative detail, so the graph is **figure-bearing
  and authoritative**. This requires re-tuning `GRAPH_EXTRACTOR_SYSTEM_PROMPT`, which
  currently *drops* measurements/figures.
- **Query side.** Both the relevance **filter** and the **summarize** stage read the
  Section graph (alongside section title + summary). The graph **replaces the
  query-time raw read on the hot path**: summarize composes grounded facts from
  summary + graph and does **not** read raw content except as a **last-resort
  escalation** when the judge finds the graph insufficient for a verbatim/fine-detail
  need.

## Considered Options

- **Keep it disabled / leaf-only.** Rejected: the artifact's whole value is at query
  time; without a consumer it is dead weight (the original disable reason).
- **Consume it as a retrieval front-end (entity lookup).** Deferred: needs a global
  entity index; the cheap, index-free win is consuming the *retrieved* section's own
  graph as evidence.
- **Two separate graphs (summary-derived + raw-derived).** Rejected as over-built: one
  graph fed by summary+raw is simpler and is both authoritative and headline-framed.
- **Augment summarize with the graph but still read raw every query.** Rejected: it
  forfeits the response-time win that motivates pre-building the graph.

## Consequences

- The query pipeline no longer reads raw content on the common path — a large
  **response-time** win — at the cost of **second-order grounding** (a fact rests on
  the raw-derived graph, not raw directly) and the graph's lossiness (verbatim detail
  it dropped is only recoverable via the last-resort raw escalation).
- Indexation cost rises: the graph stage runs on every document and reads raw.
- The depth-axis "L3 summary vs L4 raw" split largely dissolves: query-time evidence
  is *summary + Section graph*, with raw as a rare last resort.
- ADR 0002's grounding *source* changes (see its note); its single-document atomicity
  rule is unaffected — a Section graph is per-section, hence single-document.

## Scope boundary (deliberate)

Responses use **only section-level graphs** — the retrieved section's own
Entities/Statements/Relations. A **global, cross-document entity/relation index** is
**explicitly deferred**, not designed-out: it can be added later (as a retrieval
front-end for entity lookup, or a traversal layer for multi-hop relational queries)
**without changing the per-section build** — the section graphs are the substrate such
an index would aggregate. We do not build it now because no current query needs
cross-document graph traversal, and the index-free win is consuming a section's own
graph as evidence.
</content>
