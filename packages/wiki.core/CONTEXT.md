# Wiki (workbench integration)

The language of the wiki module as it lives inside the workbench: a wiki is a
Project in the opened Workspace, and its LLM work is configured independently of
chat, resolving model references through the shared AiConfig.

## Language

**Wiki**:
A knowledge base that is one **Project** within the opened **Workspace** carrying
the **wiki nature** — a top-level subdirectory whose artifacts live under
`.project/{pages,index,snapshots}`.
_Avoid_: vault, corpus.

**Nature** (cf. Eclipse project natures):
A marker on a **Project** that associates it with a toolchain and activates that
toolchain's adapters/builders. The substrate treats *every* top-level directory as
a Project; a Project becomes a **Wiki** only by carrying the wiki nature. The nature
is materialized by the presence of the project's wiki config (`.project/nature.wiki.json`)
and applied (builders registered) via the substrate's `applyNature`. A Project's wiki
nature is reached through one façade project adapter, `WikiNature`
(`project.requireAdapter(WikiNature)`): `exists()`, `initialize(config)`, scanning, `query()`.
_Avoid_: type, kind, flavor.

**Workspace**:
The single root directory the user opens; the substrate that hosts Projects,
Resources, and adapters.

**Connection**:
A configured remote model-provider endpoint registered in **AiConfig**; its
credentials live in the `Secrets` adapter, never inline.
_Avoid_: provider (overloaded — see Flagged ambiguities).

**Active Selection**:
The single chat model AiConfig marks active. **Chat-only** — wiki does not read it.

**Stage**:
A step of the wiki build/query pipeline (summarize, meta, reorganize, embed,
query, …) that can bind to its own model.

**Model Reference**:
A stored pointer to a model (a **Connection** plus a model id) that **AiConfig**
resolves into a runtime model. Serialized as the URI `connectionId:modelId` (split
on the first colon). Wiki holds one Model Reference per **Stage** plus one for
embeddings. See `ai-config/docs/adr/0001-model-reference-uri.md`.

**Document topic**:
A topic a single document declares (per-document, from the meta stage). Covered by
that document; carries a per-doc key, name, description, and brief.
_Avoid_: tag, label.

**Index topic**:
A global topic class that aggregates **document topics** of the same class, holding
references to them (`<docUri>#<perDocKey>`). A *leaf* of the topic index. = the
former `GlobalTopic`.
_Avoid_: topic node, leaf (use only for the structural discriminant).

**Category**:
An internal node of the topic index grouping **index topics** and sub-categories.
Carries no document references. Born only from splits/recluster, never from attribution.

**Topic index**:
The wiki's global topic catalogue, organised as a bounded-fan-out **DAG** (not a tree):
an **index topic** may have several parent **categories**, and a **document topic** may be
attached to several index topics. Reached through the `WikiTopicIndex` project adapter;
a flat `leaves()` view yields exactly the index topics (retrieval/query consume this),
while `roots()/children()` expose the category hierarchy (the TOC).
_Avoid_: topic tree (it is a DAG), topic graph.

**Chapter**:
A named, semantically coherent run of consecutive **sections** within one document,
carrying its own summary. Chapters may group sub-chapters (recursively), forming the
**document outline**. A chapter is a *grouping overlay* — sections stay the flat,
addressable unit (their keys are unchanged); a chapter references its section keys.

**Document outline**:
A single document's own hierarchy — `document → chapters → … → sections` — built
bottom-up; the document summary is generated from the top-level chapter summaries.
Intra-document and structural. Distinct from **WikiToc** (the wiki-level table of
contents over the topic index, which is cross-document and thematic).
_Avoid_: TOC (reserved for WikiToc), table of contents.

**Subject**:
A single search intent the query stage decomposes the user's question into. An
on-corpus question yields one or more subjects (or the whole question as one when
none are extracted). Each subject is retrieved independently and the results fused.
_Avoid_: query, prompt (overloaded).

**Front-end** (retrieval):
A retrieval strategy that, given a **Subject**, returns candidate document
**sections** by `(uri, sectionKey)`, each with a per-front-end rank. There are
four — **full-text**, **vector**, **topic-descent**, and **outlier** — fused by
**RRF fusion** into one continuous section score. They run in two phases: full-text
+ vector run **eagerly** (cheap, no LLM beyond one embed); topic-descent + outlier
are **deferred** to escalation (or run eagerly for a thematic **Subject**). See
`docs/adr/0003`.
_Avoid_: retriever, channel, hybrid search (full-text and vector are separate
front-ends, not one fused front-end).

**RRF fusion**:
Reciprocal-Rank-Fusion of the **front-ends**' ranked outputs into one continuous
per-section score: agreement across front-ends raises a section (consensus), while a
single front-end's top-ranked hit still scores high on its own (magnitude).
Down-weights topic-descent/outlier so the precision signal stays cross-method. See
`docs/adr/0003`.
_Avoid_: blending, overlap count.

**Tier**:
An escalation band of candidate **sections** derived from the continuous RRF score.
Tier-1 (the *consensus floor*) = sections surfaced by ≥2 **front-ends** or a single
front-end at top rank; lower tiers are consumed only when the composed answer is
still insufficient.
_Avoid_: rank, bucket.

**Evidence section**:
A retrieved document section (`uri` + `sectionKey` + title + summary + raw block)
that is filtered for relevance, summarised, and cited when composing an answer.
Sections are the unit every front-end produces and the unit the answer cites.

**Grounded fact**:
A single factual statement the query-side summarize stage extracts from a section's
**Details** and **Tables**, carrying the verbatim section citation(s) it rests on.
Atomic and **single-document** — a fact never merges sections from different
documents (that prevents cross-document conflation). Cross-document corroboration is
composed later: an answer **claim** may rest on grounded facts from several
documents, each independently cited. A fact with no valid citation is dropped.
See `docs/adr/0002` (atomicity) and `docs/adr/0005` (source).
_Avoid_: summary (the stage emits grounded facts, not free prose).

**Details**:
The per-**section** exhaustive facts, as a markdown string the summarizer emits in the
same pass as the section: every named entity (in full), date, identifier, figure,
finding, recommendation, threshold, and explicit condition, plus a whole-block
description of each of the section's **Tables**. Part of the routing payload
(`title + summary + details`) and the authoritative fact source the query **filter**
and **summarize** stages read. See `docs/adr/0005`.
_Avoid_: graph, triples, entities/statements/relations (the deleted RDF model).

**Table**:
A `{caption, columns, rows}` structure holding a **section**'s repetitive/structured
data (a source table, or the same attributes across several objects). Answer-tier:
loaded only when a section is selected for answer composition, never in the routing
payload. Its `columns` are a document-local schema kept explicit so a future relation
catalog can align them.
_Avoid_: matrix; do not transcribe a one-off fact as a one-row table (that goes in **Details**).

## Relationships

- A **Workspace** contains zero or more **Wikis** (each a **Project**)
- A **Topic index** belongs to one **Wiki**; its **index topics** aggregate **document topics**, and its **categories** group index topics into a DAG (every document topic attached to ≥1 index topic)
- A **Wiki** has one wiki configuration binding each **Stage** to a **Model Reference**
- **AiConfig** resolves a **Model Reference** to a runtime model via its **Connection**
- **Chat** uses the **Active Selection**; **Wiki** uses its own per-Stage references — they share only AiConfig's Connections and keys
- Each **section** carries **Details** (routing-tier facts) and **Tables** (answer-tier structured data); the query **filter** reads `title + summary + details`, and **summarize** also reads **Tables**
- The four **front-ends** fuse via **RRF fusion** into one section score; **Tiers** (escalation bands) derive from that score

## Flagged ambiguities

- "vault" (the `llm-wiki` skill / `wiki-viewer.app`) and "Project" (workbench) both
  name the same thing — resolved: in the workbench it is a **Wiki**, which *is* a Project.
- "provider" is overloaded across three things — resolved to distinct terms:
  the ai-sdk `ProviderV3` (runtime), an AiConfig **Connection** (configuration), and
  wiki's internal `LlmProvider` facade (the async→sync bridge). Use "Connection" for
  the configured endpoint.
- "summarize" names two different stages: the **build-side summarizer** (ingest —
  raw text → `DocumentSummary` of sections + **document outline**) and the **query-side
  summarize stage** (answer time — retrieved **sections** → **grounded facts**). They
  share a verb, not a job; name the stage (build summarizer / query summarize) when
  ambiguous.
- "graph" was once re-activated as the authoritative query-evidence layer (ADR 0004) —
  resolved: the RDF section graph is **deleted** (ADR 0005); per-section facts now live
  in the summarizer's **Details** (markdown) and **Tables** (structured), with no
  separate graph artifact or triples.
- a build-time fact representation and a **Grounded fact** (a query-time prose fact)
  are both single-section, single-document, cited — resolved: **Details**/**Tables**
  are the *source* the grounded fact rests on; the grounded fact is the *query-time,
  question-specific* derivation of it.
