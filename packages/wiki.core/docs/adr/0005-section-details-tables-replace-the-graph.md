---
status: accepted
supersedes: 0004
---

# Per-section evidence is summary + details + tables, produced in the summarizer

Supersedes [ADR 0004](0004-section-graphs-as-authoritative-query-evidence.md), which
re-activated the RDF section graph (`entities` + `[subject,predicate,object]`
statements/relations) as the authoritative query evidence. That graph was inefficient
for content representation: triples repeat the subject in every statement, hide
multiple sub-statements inside opaque object strings, over-flatten predicates, and
require a **second LLM pass** that re-reads the same raw text the summarizer already
read. The graph was also still write-only — no consumer had shipped.

## Decision

- **One pass.** Fact extraction is **merged into the summarizer**. A single call per
  block emits each section's `{key, title, startLine, endLine, summary, details,
  tables}`. The standalone graph stage (`graphBuilder`, `GRAPH_SIGNAL`,
  `WikiPageGraph`/`graph.json`, `GRAPH_EXTRACTOR_SYSTEM_PROMPT`,
  `filterUnknownSubjects`) is **deleted**.
- **Three non-overlapping fields.** `summary` is a thin thematic abstract (routing
  tier); `details` is the exhaustive facts as markdown — every entity (named in full),
  date, identifier, figure, finding, and explicit condition (routing tier); `tables`
  is the structured/repetitive data as `{caption, columns, rows}` (answer tier,
  loaded only when a section is selected). No fact is stated in both `summary` and
  `details`.
- **Two retrieval tiers.** The routing payload `title + summary + details` is what the
  embedder embeds, the meta-extractor reads, and query section-selection filters on.
  `tables` joins only at answer composition. The describe-a-table-as-a-whole reading
  lives in `details` (routing); the rows live in `tables` (answer) — the same data at
  two tiers.
- **Regeneration.** A `KNOWLEDGE_SCHEMA_VERSION` constant is recorded on the
  summary/meta/embeddings artifacts; builders re-run when `sourceHash` changed **or**
  the stored version mismatches, so a schema/prompt change self-heals.

## Considered Options

- **Keep the RDF graph (ADR 0004).** Rejected: the four inefficiencies above, plus a
  redundant raw read. Its one machine affordance (cross-document `(subject,predicate)`
  comparison) was never implemented and is recoverable later from `tables`.
- **Everything-as-a-table.** Rejected: a one-row table costs more tokens than a phrase
  (header+separator amortise over rows only) and re-introduces subject repetition.

## Consequences

- Query evidence is drawn from selected sections' `summary` / `details` / `tables`,
  never from a triple graph; `renderSectionGraph` is replaced by `renderSectionTables`.
- A future **global relation catalog** (consolidating document-local `tables` into
  shared schemas, mirroring the topic-index DAG) is parked; the mandatory `columns`
  field keeps `tables` catalog-ready.
