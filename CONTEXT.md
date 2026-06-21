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
**sections** by `(uri, sectionKey)`. Front-ends are interchangeable section
producers and run in parallel; today there are two — hybrid search (FTS+vector) and
the topic front-end (over the **topic index**). All on-corpus subjects run *every*
front-end and the results are fused (recall-first), rather than one being selected.
_Avoid_: retriever, channel.

**Evidence section**:
A retrieved document section (`uri` + `sectionKey` + title + summary + raw block)
that is filtered for relevance, summarised, and cited when composing an answer.
Sections are the unit every front-end produces and the unit the answer cites.

**Grounded fact**:
A single factual statement the summarize stage extracts from a document's
section(s), carrying the verbatim section citation(s) it rests on. Atomic and
**single-document** — a fact never merges sections from different documents (that
prevents cross-document conflation). Cross-document corroboration is composed
later: an answer **claim** may rest on grounded facts from several documents, each
independently cited. A fact with no valid citation is dropped.
_Avoid_: summary (the stage emits grounded facts, not free prose).

## Relationships

- A **Workspace** contains zero or more **Wikis** (each a **Project**)
- A **Topic index** belongs to one **Wiki**; its **index topics** aggregate **document topics**, and its **categories** group index topics into a DAG (every document topic attached to ≥1 index topic)
- A **Wiki** has one wiki configuration binding each **Stage** to a **Model Reference**
- **AiConfig** resolves a **Model Reference** to a runtime model via its **Connection**
- **Chat** uses the **Active Selection**; **Wiki** uses its own per-Stage references — they share only AiConfig's Connections and keys

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
