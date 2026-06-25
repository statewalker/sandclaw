# @statewalker/wiki

## What it is

`@statewalker/wiki` turns a project's raw source documents into a queryable, LLM-curated wiki. It layers a build pipeline and a set of Project/Resource adapters onto the class-keyed `workspace → project → resource` model from `@statewalker/workspace.core`: an ingestion pipeline (extract → summarize → declare topics/outliers → embed → reorganize global indexes → index for search) wired as signal-driven `ProjectBuilder` cells, a hybrid full-text + vector search adapter, an FSM-driven query retrieval router that returns grounded, cited answers, and a host-neutral CLI that drives all of it over any `FilesApi`.

## Why it exists

A wiki built by hand goes stale; a pile of raw documents is not queryable. This package automates the curation: each source becomes a layered set of derived artifacts (raw-text cache, narrative summary with section ranges, per-section embeddings, topic/outlier class declarations) that roll up into project-global topic and outlier indexes, and those artifacts back a retrieval pipeline that answers questions with verifiable citations instead of ungrounded prose.

It is the **canonical wiki module**, consolidating the older `wiki-runtime` and `@statewalker/resources-wiki` packages onto the unified workspace model. The earlier code modelled its own project/resource scaffolding and bespoke cell runtime; here the same stages are lifted onto `@statewalker/workspace.core`'s `Project`, `Resource`, `ResourceAdapter`/`ProjectAdapter`, and `ProjectBuilder` so wiki behavior composes with everything else in the workbench. Two adapters — `ContentAdapter` (extraction) and `SearchAdapter` (hybrid search) — are deliberately wiki-free by contract, so they can be lifted to standalone `resources-content` / `resources-search` packages unchanged.

## Sub-path exports

The package publishes a **single entry point** — there are no sub-paths. Everything is reached through one import:

```ts
import { registerWiki, runWikiCli, WikiQuery /* … */ } from "@statewalker/wiki";
```

| Export Path | Description |
|---|---|
| `@statewalker/wiki` | The entire public surface, composed from the internal namespaces below. |

Internally the root barrel (`src/index.ts`) re-exports these modules; the grouping is the package's mental model, not separate import paths:

| Namespace | What it contributes |
|---|---|
| `uri` | `WikiRef`, `parseWikiUri`, `normalizeWikiUri`, `toCanonical`, `formatCitation`, `parseCitation`, `isCrossWiki`, `validateWikiPath`, `assertWikiKey`, `WIKI_KEY_RE`, error classes (`InvalidWikiPathError`, `WikiKeyError`, `CrossWikiRefError`), and `openWiki`. |
| `content` | `ContentAdapter` + `contentBuilder` + `registerContentExtraction` — mime-aware text extraction (wiki-free). |
| `knowledge` | The build-stage builders (`summarizeBuilder`, `metaBuilder`, `embedderBuilder`, `docTopicEmbedderBuilder`, `reorganizeBuilder`, `topicCleanupBuilder`, `pruneBuilder`), the manual `reclusterTopics` op, per-page adapters (`ResourceTextContentCache`, `WikiPageSummary`, `WikiPageMeta`, `WikiPageEmbeddings`, `WikiPageTopicEmbeddings`), global indexes (`WikiTopicIndex` — the topic DAG, `WikiOutlierIndex`, `WikiTopicNodeEmbeddings`), Zod schemas, prompts, page-path helpers, and the artifact types. |
| `llm` | `LlmProjectAdapter` / `LlmApi` (generic Vercel-AI-SDK access), `WikiLlmConfiguration` (stage → model-name policy), `llmOf` / `wikiConfigOf` resolvers, and pricing helpers (`costOf`, `sumCosts`, `roundUsd`). |
| `search` | `SearchAdapter` + `searchBuilder` + `registerSearch` — project-level hybrid (FTS + vector) search (wiki-free). |
| `query` | `WikiQuery` (the `ask(question)` adapter), `QueryProgress` (observable run), `Answer` / `EvidenceSection` / `AnswerTopic` types, and `WikiSnapshotsAdapter` (frozen saved answers/reports). |
| `runtime` | `registerWiki`, `wireWikiProject`, `createWikiBuilders` (composition root), `runWikiCli` (host-neutral CLI), and `resolveProvidersFromEnv`. |

## How to use

```sh
pnpm add @statewalker/wiki
```

The package never reads the environment or touches `node:fs` from its adapters — providers, model names, and a `FilesApi` are injected at a single composition root (`registerWiki`). Setup is three steps: register the adapters on a `Workspace`, attach the builders to a `Project`, run them; then query.

```ts
import {
  registerWiki,
  wireWikiProject,
  WikiQuery,
} from "@statewalker/wiki";
import { Workspace } from "@statewalker/workspace.core";
import { NodeFilesApi } from "@statewalker/webrun-files-node";
import { createOpenAI } from "@ai-sdk/openai";

// 1. A workspace over the vault directory.
const files = new NodeFilesApi({ rootDir: "/my/vault" });
const workspace = new Workspace().setFileSystem(files);
await workspace.open();

// 2. Register the full wiki adapter pack — providers/config injected here.
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
registerWiki(workspace, {
  provider: {
    languageModel: (name) => openai(name),
    textEmbeddingModel: (name) => openai.embeddingModel(name),
  },
  models: { default: "gpt-4.1-mini", queryStrong: "gpt-4.1" },
  embedModel: "text-embedding-3-small",
  dimensionality: 1536,
});

// 3. Open the wiki project (its key = the directory's first path segment),
//    attach the builders, and run the pipeline.
const project = await workspace.getProject("notes", true);
const builder = wireWikiProject(project);
for await (const _stage of builder.run()) { /* progress */ }

// 4. Ask a question — grounded, cited answer.
const progress = project.requireAdapter(WikiQuery).ask("What is X?");
const answer = await progress.complete();
console.log(answer.text, answer.citations);
```

### Pipeline data flow

```
sources ─▶ Extractor ─▶ Summarizer ─▶ MetaExtractor ─▶ DocTopicEmbedder ─▶ IndexReorganizer
              (content)   (summarized)      (meta)      (doc-topics-embedded)   (topic DAG + outliers)
                              │                                                  │      │
                              │                            (on removal) IndexPruner ◀───┤
                              │                                       TopicCleanup ◀────┘
                              │                                      (merge near-dups; topic-tree)
                              └─▶ Embedder ─▶ SearchIndexer ─▶ wiki-search index (FTS + vector)
                                  (embedded)

query ─▶ WikiQuery.ask ─▶ QUERY_FSM ─▶ Answer { text, citations, topics, outliers, caveats }
```

Each builder is a `RegisteredBuilder` consuming an input signal and emitting an output signal; the engine (`ProjectBuilder`) only re-runs a stage when its inputs changed. Stages skip their costly LLM call when the source SHA-256 is unchanged (and re-emit downstream so a re-run after invalidation rebuilds derived artifacts without re-summarizing).

## Examples

### Per-page and global adapters directly

```ts
import {
  WikiPageSummary,
  WikiPageEmbeddings,
  WikiTopicIndex,
} from "@statewalker/wiki";

const resource = await project.getProjectResource("intro.md");
const summary = await resource!.requireAdapter(WikiPageSummary).get();
// summary?.sections: [{ key, title, startLine, endLine, summary }]

const vectors = await resource!
  .requireAdapter(WikiPageEmbeddings)
  .getVectors("text-embedding-3-small", 1536); // Map<sectionKey, Float32Array>

// `leaves()` is the flat index-topic view (retrieval/CLI iterate it unchanged);
// `roots()` / `children(key)` expose the category hierarchy.
for await (const topic of project.requireAdapter(WikiTopicIndex).leaves()) {
  console.log(topic.key, topic.name, topic.references.length);
}
```

### Hybrid search without the query FSM

```ts
import { SearchAdapter } from "@statewalker/wiki";

const matches = await project.requireAdapter(SearchAdapter).search({
  query: "vector index persistence",
  modes: ["fts", "vector"], // either or both; default is both
  topK: 20,
});
// matches: [{ uri, sections: [{ sectionKey, score, snippet? }] }]
```

### Wiki URIs and citations

```ts
import { parseWikiUri, normalizeWikiUri, formatCitation } from "@statewalker/wiki";

parseWikiUri("/notes/intro.md#overview");
// { path: "notes/intro.md", section: "overview" }

normalizeWikiUri("wiki://notes/intro.md#overview", "notes");
// "notes/intro.md#overview"   (throws CrossWikiRefError for a foreign key)

formatCitation({ key: "notes", path: "intro.md", section: "overview" });
// "[[/intro.md#overview]]"     (local refs are scheme-less absolute paths)
```

### Saving answers as frozen snapshots

```ts
import { WikiSnapshotsAdapter } from "@statewalker/wiki";

const snapshots = project.requireAdapter(WikiSnapshotsAdapter);
const id = await snapshots.saveAnswer(answer, "What is X?");
// runReport({ prompts: [...] }) runs each prompt through WikiQuery and freezes the batch.
```

### CLI (host-neutral)

`runWikiCli` owns no streams — the caller wires `FilesApi`, `env`, and the output/diagnostics channels. `bin/wiki.ts` binds them to `NodeFilesApi`, `process.env`, and stdout/stderr:

```sh
# bin/wiki.ts:  wiki <root> <command> <project> [args…]
tsx bin/wiki.ts /my/vault scan notes              # run the build pipeline
tsx bin/wiki.ts /my/vault status notes            # per-builder pending counts
tsx bin/wiki.ts /my/vault query notes "what is X" # routed, cited answer (JSON/YAML)
tsx bin/wiki.ts /my/vault invalidate notes Embedder  # reset a stage + downstream
```

Flags: `--format <none|json|yaml>` (data channel; default `json`), `--log-level <fatal|…|trace>`. The structured result goes to the data channel (stdout); progress, status, and per-model/per-stage cost stats go to the diagnostics channel (stderr) — keeping stdout a clean, ObservableHQ-data-loader-style stream. Providers/models are resolved from the environment via `resolveProvidersFromEnv` (`WIKI_PROVIDER` = `openai` | `google`, plus `WIKI_MODEL*` / `WIKI_EMBED_MODEL` / `WIKI_EMBED_DIM` overrides and the provider's API-key var).

## Internals

### Architectural decisions

- **Everything is a workspace adapter.** Per-page artifacts are `ResourceAdapter`s (`WikiPageSummary`, `WikiPageMeta`, `WikiPageEmbeddings`, `WikiPageTopicEmbeddings`, `ResourceTextContentCache`); project-wide concerns are `ProjectAdapter`s (`WikiTopicIndex`, `WikiTopicNodeEmbeddings`, `WikiOutlierIndex`, `SearchAdapter`, `WikiQuery`, `WikiSnapshotsAdapter`); model access is the generic `LlmProjectAdapter` and model *policy* the wiki-specific `WikiLlmConfiguration`. Concrete adapter classes self-host on their handle, so most need no explicit registration — `registerKnowledgeAdapters` / `registerQuery` are intentional no-ops kept for composition-root symmetry.
- **Generic-vs-wiki LLM split.** `LlmProjectAdapter` is a provider-agnostic Vercel-AI-SDK wrapper (`generateObject`, `generateText`/`streamText`, `embed`/`embedBatch`); which model each *stage* uses is policy that lives in `WikiLlmConfiguration.modelFor(stage)`, falling back to `default`. Tests register an `LlmApi` stub under the `LlmProjectAdapter` key — no provider needed.
- **Composition root reads the environment; adapters never do.** `registerWiki` takes a `provider`/`llm`, model names, and embedding config and injects them; `resolveProvidersFromEnv` is the only env reader, used by the CLI boundary.
- **Two adapters are wiki-free by contract.** `ContentAdapter` and `SearchAdapter` reference no wiki types — content (and its precomputed embeddings) flows into search through an injected `SearchBlocksProvider` (`wikiSearchBlocks`), so both can be extracted to standalone packages.
- **Local-vs-cross-wiki URI scheme.** A local reference renders as a scheme-less absolute path (`/path#section`); the `wiki://[host:]key/...` scheme is reserved for cross-wiki references, where the authority key is the target `Project.projectName`. `normalizeWikiUri` rejects foreign keys with `CrossWikiRefError`.
- **Query as a validated FSM.** The retrieval pipeline is a flat `@statewalker/fsm` state machine (`QUERY_FSM`), validated by `@statewalker/fsm-validator`; a wildcard `["*", "error", ""]` transition terminates from any state declaratively rather than via an imperative engine call.

### Algorithms

- **Hash-gated incremental builds.** Each source's raw text is cached (`raw.txt` + `raw.meta.json`) with the SHA-256 of the original bytes. Summarizer/Meta/Embedder compare that hash against the `sourceHash` stamped on their last artifact and skip the LLM call when unchanged — but still emit their output signal on a hash-skip, so invalidating one stage re-feeds downstream without re-running upstream LLM stages.
- **Section embeddings in Arrow sidecars.** Per-document embeddings split metadata (`embeddings.<model>.<dim>.json`) from the dense vectors (`embeddings.<model>.<dim>.arrow`, a `FixedSizeList<Float32>[dim]` column via `@uwdata/flechette`) — JSON float arrays are too large. Model + dimensionality are in the filename so switching models never collides. The Arrow file is written first and the JSON marker last, so a crash never leaves metadata pointing at missing vectors.
- **The topic index is a bounded-fan-out DAG.** `WikiTopicIndex` stores `{ roots, nodes }` where each node is either a *category* (internal, `childKeys`, no refs) or an *index topic* (leaf, `references`, no children). A leaf may have several parent categories and a document reference may sit under several leaves (many-to-many, acyclic). The flat `leaves()` view *is* the former global-topic list, so retrieval and the CLI iterate it unchanged; `roots()`/`children()` expose the hierarchy and back `wiki-toc`'s `suggest()`. A legacy flat `{ topics: [] }` artifact is lifted to a DAG on read (every former topic an index topic under `roots`) — no migration tooling.

- **Semantic attribution scales by construction — no LLM call sees the whole index.** On any document-topics-embedded change, removed declaration, or removed source, the reorganizer strips the touched documents' references (keeping now-empty leaves so a re-ingest folds back into the *same* stable key) and attributes each document topic: a key/alias match attaches mechanically (no LLM); otherwise the document topic's embedding retrieves a small candidate set of index nodes and one bounded `generateObject` round adjudicates (attach to ≥1 index topic / coin under a category); a coverage backstop coins any leftover so every document topic lands on ≥1 index topic. With no embed model it degrades to key/alias match + bounded root-descent. Candidates are batched (`ATTRIBUTE_BATCH_SIZE`) so a large rebuild never overflows the context window. Document-topic vectors come from the `sourceHash`-gated `DocTopicEmbedder`; index-node vectors are maintained inline by the writers into a project-level store so a coined node is an attribution candidate in the same cycle.

- **Local in-place splits keep nodes bounded.** A category over the fan-out `B` (`topicFanout`) is split into sub-categories; an index topic over the reference cap `R` (`topicLeafCap`) is refined and promoted in place to a category partitioning its references. Both are heuristic — declined (node left oversized) when the LLM finds no honest sub-grouping.

- **Three maintenance tiers.** (1) incremental attribution + local splits per ingest; (2) automatic `TopicCleanup` (on `topic-tree`) merges scattered near-duplicate index topics — mechanical vector-NN finds the clusters with no context limit and the LLM only adjudicates small candidate sets, unioning references + parents and recording absorbed keys as aliases — then refines any leaf a merge left overgrown; (3) the manual `reclusterTopics` (`wiki:recluster-topics` command) regroups the category hierarchy, leaving a valid acyclic DAG if interrupted. Outliers stay flat and merge mechanically by `globalClass ?? key`, no LLM.
- **Hybrid search + RRF.** The `wiki-search` FlexSearch index holds an FTS sub-index (section summary + raw text) and a vector sub-index (the precomputed section embedding); results are fused (RRF) and grouped by document. The index is persisted incrementally under `index/search/` (throttled to once per 2 s, forced on drain) and loaded as-is on query — no query-time corpus re-embedding.
- **Tiered retrieval router.** `IntentDetection → Retrieve → SelectSections → Summarize → Respond → Verify → Response`, with `NegativeResponse` reachable from intent (off-corpus), retrieve (no candidates), and select (filter kept nothing). `Retrieve` runs the mechanical hybrid search and the LLM topic/doc-topic class ladder in parallel per subject, merged into one evidence pool; `SelectSections` consumes retrieval tiers (intersection first) and is re-entered to escalate when `Respond` judges the evidence insufficient; `Verify` mechanically drops any claimed citation that does not resolve to a retrieved `(uri, sectionKey)`.

### Constraints

- **Artifacts live under the project system folder** (`<project>/.project/pages/<uri>/` per page, `<project>/.project/index/` for global indexes and the search index, `<project>/.project/snapshots/` for saved answers). The project key is the resource path's first segment.
- **A bad document is isolated, not fatal.** Every per-page stage logs and skips on error (and marks the input handled so it is not retried until its source changes) rather than failing the whole pipeline.
- **Per-section facts live in the summary, not a separate graph.** The summarizer emits each section's `details` (exhaustive markdown facts) and `tables` (structured `{caption, columns, rows}`) in the same pass; query evidence is drawn from `summary` / `details` / `tables` (ADR 0005, superseding the deleted RDF section graph of ADR 0004).
- **Snapshots are frozen and temporally versioned** — never auto-updated, never re-ingested as sources; re-running a subject creates a new dated snapshot.
- **`generateObject` retries once** on a schema-deviation (`NoObjectGeneratedError`) before surfacing the raw output; `normalizeMeta` deterministically drops blank-keyed topics and outliers missing the required `whySurprising` justification.

### Dependencies

- `@statewalker/workspace.core` — the `Workspace`/`Project`/`Resource` model, `ResourceAdapter`/`ProjectAdapter`, and the `ProjectBuilder` signal-driven build engine the whole pipeline rides on.
- `@statewalker/content-extractors` — mime-aware text extraction registry (`createDefaultRegistry`) behind `ContentAdapter`.
- `@statewalker/indexer-api` / `-fulltext` / `-vector` / `-mem-flexsearch` — the FTS + vector index abstractions and the in-memory FlexSearch backend behind `SearchAdapter`.
- `@statewalker/fsm` (+ `-validator` in dev) — the query retrieval state machine.
- `@statewalker/webrun-files` — the `FilesApi` abstraction; production code is FilesApi-exclusive (no `node:fs`). `NodeFilesApi` is bound only at the CLI boundary (`bin/wiki.ts`), `MemFilesApi` in tests.
- `ai` + `@ai-sdk/openai` + `@ai-sdk/google` — the Vercel AI SDK and the two providers `resolveProvidersFromEnv` selects between.
- `@uwdata/flechette` — Arrow encoding/decoding for the embedding sidecars.
- `yaml`, `zod` — CLI YAML serialization and stage I/O schemas.

## Related

- `@statewalker/workspace.core` — the workspace → project → resource model this package builds on.
- `@statewalker/ai-agent` — the sibling agent runtime; a peer consumer of the workspace and AI-SDK layers.

## License

MIT — see the monorepo root `LICENSE`.
