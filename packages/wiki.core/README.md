# @statewalker/wiki.core

## What it is

`@statewalker/wiki.core` turns a project's raw source documents into a queryable, LLM-curated wiki. It layers a build pipeline and a set of Project/Resource adapters onto the class-keyed `workspace → project → resource` model from `@statewalker/workspace.core`: an ingestion pipeline (extract → summarize → declare topics/outliers → extract tables → embed → reorganize global indexes → index for search) wired as signal-driven `ProjectBuilder` cells, a hybrid full-text + vector search adapter, an FSM-driven query retrieval router that returns grounded, cited answers, generated thematic "sites", AI-SDK tools and commands, and a host-neutral CLI that drives all of it over any `FilesApi`.

## Why it exists

A wiki built by hand goes stale; a pile of raw documents is not queryable. This package automates the curation: each source becomes a layered set of derived artifacts (raw-text cache, a summary tree with section line ranges, per-section embeddings, topic/outlier declarations, extracted tables) that roll up into project-global topic and outlier indexes. Those artifacts back a retrieval pipeline that answers questions with verifiable citations.

It builds on the workspace model instead of its own project scaffolding, so wiki behavior composes with anything else that uses `@statewalker/workspace.core` (the file explorer, chat tools, other project natures). Two adapters, `ContentAdapter` (extraction) and `SearchAdapter` (hybrid search), are wiki-free by contract, so they can be reused without the wiki.

## How to use

### Install

```sh
pnpm add @statewalker/wiki.core @statewalker/workspace.core
```

There are no peer dependencies. You also need a `FilesApi` implementation, for example `@statewalker/webrun-files-node` (Node) or `@statewalker/webrun-files-mem` (tests).

### One entry point, grouped into modules

The package has a **single entry point** (`.` → `dist/index.js` + `dist/index.d.ts`); there are no sub-paths. It is environment-neutral: production code uses only the injected `FilesApi`, never `node:fs` or `process.env`. The exception is `resolveProvidersFromEnv`, which reads an env object you pass in.

```ts
import { registerWiki, wikiNatureOf, WikiQuery /* … */ } from "@statewalker/wiki.core";
```

The root barrel (`src/index.ts`) re-exports these internal modules. The grouping is the package's mental model, not separate import paths:

| Module | What it contributes |
|---|---|
| `uri` | `WikiRef`, `parseWikiUri`, `normalizeWikiUri`, `toCanonical`, `formatCitation`, `parseCitation`, `isCrossWiki`, `validateWikiPath`, `assertWikiKey`, `WIKI_KEY_RE`, error classes (`InvalidWikiPathError`, `WikiKeyError`, `CrossWikiRefError`), and `openWiki`. |
| `content` | `ContentAdapter` + `contentBuilder` + `registerContentExtraction`: mime-aware text extraction (wiki-free). |
| `knowledge` | The build-stage builders (`summarizeBuilder`, `metaBuilder`, `tableExtractorBuilder`, `embedderBuilder`, `docTopicEmbedderBuilder`, `reorganizeBuilder`, `topicCleanupBuilder`, `pruneBuilder`), the manual `reclusterTopics` op, per-page adapters (`ResourceTextContentCache`, `WikiPageSummary`, `WikiPageSummaryDraft`, `WikiPageMeta`, `WikiPageTables`, `WikiPageEmbeddings`, `WikiPageTopicEmbeddings`), global indexes (`WikiTopicIndex`, the topic DAG; `WikiOutlierIndex`; `WikiTopicNodeEmbeddings`), Zod schemas, prompts, page-path helpers, summary-tree helpers (`summaryLeaves`, `findSummaryNode`, `summaryPath`), and the artifact types. |
| `llm` | `LlmProjectAdapter` / `LlmApi` / `LlmProvider` (generic Vercel-AI-SDK access), `WikiLlmConfiguration` (per-project stage → model policy, read from `.project/nature.wiki.json`), `llmOf` / `wikiConfigOf` resolvers, build-session telemetry (`WikiBuildSession`, `buildSessionOf`, `BuildTracer`), and pricing helpers (`costOf`, `sumCosts`, `roundUsd`). |
| `search` | `SearchAdapter` + `searchBuilder` + `registerSearch`: project-level hybrid (FTS + vector) search (wiki-free). |
| `query` | `WikiQuery` (the `ask(question)` adapter), `QueryProgress` (observable run), `Answer` / `EvidenceSection` / `AnswerTopic` types, and `WikiSnapshotsAdapter` (frozen saved answers/reports). |
| `runtime` | `registerWiki`, `wikiNature`, `wireWikiProject`, `createWikiBuilders` (composition root); `WikiNature` / `wikiNatureOf` (per-project façade: `exists`, `initialize`, `reconfigure`, `scan`, `query`); `runWikiCli` (host-neutral CLI); `resolveProvidersFromEnv`; `buildIndexIgnore`. |
| `site` | `WikiToc` / `wikiTocOf` (table-of-contents files), `WikiSite` / `wikiSiteOf` (generated thematic sites), `createWikiSiteTools` (AI-SDK tools `suggest_toc`, `save_toc`, `generate_site`), and the `OpenWikiSiteCommand` (`wiki:open-site`) contract that `@statewalker/wiki.view.react` handles. |
| `tools` | `createWikiTools` (AI-SDK tools `wiki_search`, `wiki_ask`), `registerWikiCommands` with `WikiSearchCommand` (`wiki:search`), `WikiAskCommand` (`wiki:ask`), `WikiReclusterTopicsCommand` (`wiki:recluster-topics`), the `wikiSearch` / `wikiAsk` operations, and `resolveWikiMasks`. |

### Happy path: register, initialize, scan, query

Adapters never read the environment. Providers and a `FilesApi` are injected at one composition root (`registerWiki`). Model names live in a per-project config file, `<project>/.project/nature.wiki.json`, written by `WikiNature.initialize()`. Setup: register the adapters on a `Workspace`, initialize the project's wiki nature, scan, then query.

```ts
import { registerWiki, wikiNatureOf } from "@statewalker/wiki.core";
import { Workspace } from "@statewalker/workspace.core";
import { NodeFilesApi } from "@statewalker/webrun-files-node";
import { createOpenAI } from "@ai-sdk/openai";

// 1. A workspace over the vault directory.
const files = new NodeFilesApi({ rootDir: "/my/vault" });
const workspace = new Workspace().setFileSystem(files);
await workspace.open();

// 2. Register the wiki adapter pack. Only the provider is injected here.
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
registerWiki(workspace, {
  provider: {
    languageModel: (name) => openai(name),
    textEmbeddingModel: (name) => openai.embeddingModel(name),
  },
});

// 3. Open the project (a top-level directory) and give it the wiki nature.
//    Omit embedModel/dimensionality for a full-text-only wiki.
const project = await workspace.getProject("notes", true);
const wiki = wikiNatureOf(project!);
if (!(await wiki.exists())) {
  await wiki.initialize({
    models: { default: "gpt-4.1-mini", queryStrong: "gpt-4.1" },
    embedModel: "text-embedding-3-small",
    dimensionality: 1536,
  });
}

// 4. Run the build pipeline.
for await (const _progress of wiki.scan().run()) { /* progress */ }

// 5. Ask a question: grounded, cited answer.
const progress = await wiki.query("What is X?");
const answer = await progress.complete();
console.log(answer.text, answer.citations);
```

### What breaks if you skip a step

`wiki.scan()` and `wiki.query()` load the per-project config first. If you use the lower-level pieces (`wireWikiProject(project).run()`, `project.requireAdapter(WikiQuery).ask(...)`), call `await wikiConfigOf(project).load()` yourself before running them. The embedding model and dimensionality are frozen once the search index is built: `wiki.reconfigure()` throws `WikiEmbeddingFrozenError` on a change until you re-index with `wiki.scan().restartFrom("Embedder")`.

Errors you will see:

- `registerWiki: either \`provider\` or \`llm\` is required`: `registerWiki` got neither.
- `wiki nature not initialized: <project>/.project/nature.wiki.json is absent`: the project was never `initialize()`d (or the path is not a wiki).
- `WikiLlmConfiguration not loaded; call load() first`: a builder or query ran through the low-level API before the config was loaded.
- `embedding is frozen: the index was built with "<model>"/<dim>; re-index with scan().restartFrom("Embedder") before changing it`: `reconfigure()` changed the embedding model or dimensionality.
- `wiki search: no embedding model configured (text-only project)`: a vector search reached a project without `embedModel`. The search adapter normally drops vector mode for such projects.
- `generateObject(<name>) did not match schema (finishReason=…); output: …`: the model returned invalid structured output twice in a row.
- A scan that returns immediately with no progress: another tab or process holds the project's scan lease (`.project/state/scan.lock`). It logs `scan skipped: lease held by another writer` at debug level only.

### How data flows through the pipeline

```
sources ─▶ Extractor ─▶ Summarizer ─▶ MetaExtractor ─▶ DocTopicEmbedder ─▶ IndexReorganizer
              (content)   (summarized)      (meta)      (doc-topics-embedded)   (topic DAG + outliers)
                              │                                                  │      │
                              │                            (on removal) IndexPruner ◀───┤
                              │                                       TopicCleanup ◀────┘
                              │                                      (merge near-dups; topic-tree)
                              ├─▶ TableExtractor (sections flagged as holding tables)
                              └─▶ Embedder ─▶ SearchIndexer ─▶ wiki-search index (FTS + vector)
                                  (embedded)

query ─▶ WikiQuery.ask ─▶ QUERY_FSM ─▶ Answer { text, citations, topics, outliers, caveats }
```

Each builder is a `RegisteredBuilder` consuming an input signal and emitting an output signal; the engine (`ProjectBuilder`) only re-runs a stage when its inputs changed. Stages skip their costly LLM call when the source SHA-256 is unchanged (and re-emit downstream so a re-run after invalidation rebuilds derived artifacts without re-summarizing).

## Examples

### Read per-page and global artifacts directly

```ts
import {
  summaryLeaves,
  WikiPageSummary,
  WikiPageEmbeddings,
  WikiTopicIndex,
} from "@statewalker/wiki.core";

const resource = await project.getProjectResource("intro.md");
const summary = await resource!.requireAdapter(WikiPageSummary).get();
// summary is a tree: { key, title, summary, startLine, endLine, children? }
const sections = summary ? summaryLeaves(summary) : []; // leaf sections

const vectors = await resource!
  .requireAdapter(WikiPageEmbeddings)
  .getVectors("text-embedding-3-small", 1536); // Map<sectionKey, Float32Array>

// `leaves()` is the flat index-topic view (retrieval/CLI iterate it unchanged);
// `roots()` / `children(key)` expose the category hierarchy.
for await (const topic of project.requireAdapter(WikiTopicIndex).leaves()) {
  console.log(topic.key, topic.name, topic.references.length);
}
```

### Run hybrid search without the query pipeline

```ts
import { SearchAdapter } from "@statewalker/wiki.core";

const matches = await project.requireAdapter(SearchAdapter).search({
  query: "vector index persistence",
  modes: ["fts", "vector"], // either or both; default is both
  topK: 20,
});
// matches: [{ uri, sections: [{ sectionKey, score, snippet?, modes }] }]
// Optional: ftsQueries (full-text query ladder), paths (path-prefix scope).
```

### Parse and format wiki URIs and citations

```ts
import { parseWikiUri, normalizeWikiUri, formatCitation } from "@statewalker/wiki.core";

parseWikiUri("/notes/intro.md#overview");
// { path: "notes/intro.md", section: "overview" }

normalizeWikiUri("wiki://notes/intro.md#overview", "notes");
// "intro.md#overview"   (throws CrossWikiRefError for a foreign key)

formatCitation({ key: "notes", path: "intro.md", section: "overview" });
// "[[/intro.md#overview]]"     (local refs are scheme-less absolute paths)
```

### Save answers as frozen snapshots

```ts
import { WikiSnapshotsAdapter } from "@statewalker/wiki.core";

const snapshots = project.requireAdapter(WikiSnapshotsAdapter);
const id = await snapshots.saveAnswer(answer, "What is X?");
// runReport({ prompts: [...] }, label?) runs each prompt through WikiQuery and freezes the batch.
// listSnapshots() / getSnapshot(id) read them back.
```

### Drive everything from the host-neutral CLI

`runWikiCli` owns no streams: the caller wires `FilesApi`, `env`, and the output/diagnostics channels. `bin/wiki.ts` binds them to `NodeFilesApi`, `process.env`, and stdout/stderr. It runs from source with `tsx`, so use it from this repository through the package's `start` script (the published package has no `bin` entry):

```sh
# wiki <root> <command> <project> [args…]
pnpm --filter @statewalker/wiki.core start /my/vault scan notes              # run the build pipeline ("force" re-runs every stage)
pnpm --filter @statewalker/wiki.core start /my/vault status notes            # per-builder pending counts
pnpm --filter @statewalker/wiki.core start /my/vault query notes "what is X" # routed, cited answer
pnpm --filter @statewalker/wiki.core start /my/vault search notes "vector index" --mode hybrid --top-k 20
pnpm --filter @statewalker/wiki.core start /my/vault restart notes Embedder  # restart from a stage
pnpm --filter @statewalker/wiki.core start /my/vault invalidate notes Embedder  # reset a stage + downstream
```

Flags: `--format <none|json|yaml>` (data channel; default `json`), `--log-level <fatal|error|warn|info|debug|trace>`. For `search`: `--mode <fts|vector|hybrid>`, `--detail <short|normal|full>`, `--top-k <n>` (default 20), `--vector <q>`, and repeated `--fts <q>`. The structured result goes to stdout; progress, status, and per-model/per-stage cost stats go to stderr. Providers and models come from the environment via `resolveProvidersFromEnv`: `WIKI_PROVIDER` = `openai` (default, needs `OPENAI_API_KEY`) or `google` (needs `GOOGLE_GENERATIVE_AI_API_KEY`), plus `WIKI_MODEL`, `WIKI_MODEL_FAST`, `WIKI_MODEL_STRONG`, `WIKI_EMBED_MODEL`, `WIKI_EMBED_DIM`. On the first `scan` these seed the project's `.project/nature.wiki.json`; later runs read that file.

Two things that trip people up:

- Every command, even `status`, resolves providers first. Without a key it exits with `missing required env var OPENAI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY` with `WIKI_PROVIDER=google`).
- `pnpm --filter` runs the script inside `packages/wiki.core`, so a relative `<root>` resolves from there. Pass an absolute path. A missing project prints `project not found: <project>` (only `scan` creates it).

## Internals

### Why it is built this way

- **Everything is a workspace adapter.** Per-page artifacts are `ResourceAdapter`s (`WikiPageSummary`, `WikiPageMeta`, `WikiPageTables`, `WikiPageEmbeddings`, `WikiPageTopicEmbeddings`, `ResourceTextContentCache`); project-wide concerns are `ProjectAdapter`s (`WikiTopicIndex`, `WikiTopicNodeEmbeddings`, `WikiOutlierIndex`, `SearchAdapter`, `WikiQuery`, `WikiSnapshotsAdapter`, `WikiNature`, `WikiToc`, `WikiSite`); model access is the generic `LlmProjectAdapter` and model *policy* the wiki-specific `WikiLlmConfiguration`. Concrete adapter classes self-host on their handle, so most need no explicit registration — `registerKnowledgeAdapters` / `registerQuery` are intentional no-ops kept for composition-root symmetry.
- **Generic-vs-wiki LLM split.** `LlmProjectAdapter` is a provider-agnostic Vercel-AI-SDK wrapper (`generateObject`, `generateText`/`streamText`, `embed`/`embedBatch`); which model each *stage* uses is per-project policy in `.project/nature.wiki.json`, read by `WikiLlmConfiguration` (`modelFor(stage)` falls back to `default`). Tests register an `LlmApi` stub under the `LlmProjectAdapter` key — no provider needed.
- **Composition root reads the environment; adapters never do.** `registerWiki` takes a `provider` (or an `llm` stub) and optional `extractors`/`clock`; model names and embedding config come from the per-project config file. `resolveProvidersFromEnv` is the only env reader, used at the CLI boundary.
- **Two adapters are wiki-free by contract.** `ContentAdapter` and `SearchAdapter` reference no wiki types — content (and its precomputed embeddings) flows into search through an injected `SearchBlocksProvider` (`wikiSearchBlocks`), so both can be extracted to standalone packages.
- **Local-vs-cross-wiki URI scheme.** A local reference renders as a scheme-less absolute path (`/path#section`); the `wiki://[host:]key/...` scheme is reserved for cross-wiki references, where the authority key is the target `Project.projectName`. `normalizeWikiUri` rejects foreign keys with `CrossWikiRefError`.
- **Query as a validated FSM.** The retrieval pipeline is a flat `@statewalker/fsm` state machine (`QUERY_FSM`), checked by `@statewalker/fsm-validator` in the test suite; a wildcard `["*", "error", ""]` transition terminates from any state declaratively rather than via an imperative engine call.

### Algorithms worth knowing

- **Hash-gated incremental builds.** Each source's raw text is cached (`raw.txt` + `raw.meta.json`) with the SHA-256 of the original bytes. Summarizer/Meta/Embedder compare that hash against the `sourceHash` stamped on their last artifact and skip the LLM call when unchanged — but still emit their output signal on a hash-skip, so invalidating one stage re-feeds downstream without re-running upstream LLM stages.
- **Section embeddings in Arrow sidecars.** Per-document embeddings split metadata (`embeddings.<model>.<dim>.json`) from the dense vectors (`embeddings.<model>.<dim>.arrow`, a `FixedSizeList<Float32>[dim]` column via `@uwdata/flechette`) — JSON float arrays are too large. Model + dimensionality are in the filename so switching models never collides. The Arrow file is written first and the JSON marker last, so a crash never leaves metadata pointing at missing vectors.
- **The topic index is a bounded-fan-out DAG.** `WikiTopicIndex` stores `{ roots, nodes }` where each node is either a *category* (internal, `childKeys`, no refs) or an *index topic* (leaf, `references`, no children). A leaf may have several parent categories and a document reference may sit under several leaves (many-to-many, acyclic). The flat `leaves()` view is what retrieval and the CLI iterate; `roots()`/`children()` expose the hierarchy and back `WikiToc.suggest()`. Backward compatibility: a flat `{ topics: [] }` artifact is detected on read and lifted to a DAG (every topic becomes an index topic under `roots`), so no migration step is needed.

- **Semantic attribution scales by construction — no LLM call sees the whole index.** On any document-topics-embedded change, removed declaration, or removed source, the reorganizer strips the touched documents' references (keeping now-empty leaves so a re-ingest folds back into the *same* stable key) and attributes each document topic: a key/alias match attaches mechanically (no LLM); otherwise the document topic's embedding retrieves a small candidate set of index nodes and one bounded `generateObject` round adjudicates (attach to ≥1 index topic / coin under a category); a coverage backstop coins any leftover so every document topic lands on ≥1 index topic. With no embed model it degrades to key/alias match + bounded root-descent. Candidates are batched (`ATTRIBUTE_BATCH_SIZE`) so a large rebuild never overflows the context window. Document-topic vectors come from the `sourceHash`-gated `DocTopicEmbedder`; index-node vectors are maintained inline by the writers into a project-level store so a coined node is an attribution candidate in the same cycle.

- **Local in-place splits keep nodes bounded.** A category over the fan-out `B` (`topicFanout`) is split into sub-categories; an index topic over the reference cap `R` (`topicLeafCap`) is refined and promoted in place to a category partitioning its references. Both are heuristic — declined (node left oversized) when the LLM finds no honest sub-grouping.

- **Three maintenance tiers.** (1) incremental attribution + local splits per ingest; (2) automatic `TopicCleanup` (on `topic-tree`) merges scattered near-duplicate index topics — mechanical vector-NN finds the clusters with no context limit and the LLM only adjudicates small candidate sets, unioning references + parents and recording absorbed keys as aliases — then refines any leaf a merge left overgrown; (3) the manual `reclusterTopics` (`wiki:recluster-topics` command) regroups the category hierarchy, leaving a valid acyclic DAG if interrupted. Outliers stay flat and merge mechanically by `globalClass ?? key`, no LLM.
- **Hybrid search + RRF.** The `wiki-search` FlexSearch index holds an FTS sub-index (section title + summary + raw text) and a vector sub-index (the precomputed section embedding); results are fused (RRF) and grouped by document. Each sub-index retrieves up to 500 candidates before fusion and the fused result is capped at 100 by default (`topK`), so each modality contributes a deep list before truncation and a strong single-strategy hit is not buried. The index is persisted incrementally under `index/search/` (throttled to once per 2 s, forced on drain) and loaded as-is on query — no query-time corpus re-embedding.
- **Lean-first query with an abductive loop behind it.** `WikiQuery.ask` runs the `QUERY_FSM` state machine:

  ```
  IntentDetection ─offCorpus─▶ NegativeResponse
        │lean                              │abductive (synthesis query, or queryMode "full-only")
        ▼                                  ▼
  LeanRetrieve ─empty──────────────▶ Hypothesize ◀────────────contradicted─┐
        │retrieved                         │                                │
        ▼                                  ▼                                │
  SelectSections ─▶ RollingSummarize   Retrieve ◀──narrow── Score ──────────┤
        (shared by both paths)             │                  │covered/      │exhaustedEmpty
        │summarizedLean                    └─▶ SelectSections ─▶ RollingSummarize ─▶ Score
        ▼                                                     │exhausted     ▼
  LeanRespond ─insufficient─▶ Hypothesize                     ▼          NegativeResponse
        │sufficient                                        Respond
        ▼                                                     │
      Verify ◀────────────────────────────────────────────────┘
        ▼
      Response
  ```

  The default `lean-first` mode answers simple lookups with one cheap pass (hybrid search only, cheap compose) and escalates to the abductive loop only when the lean answer is insufficient. `full-only` always runs the loop, for comparison. `Verify` mechanically drops any claimed citation that does not resolve to a retrieved `(uri, sectionKey)`.
- **Grounded facts never span documents.** The query-side summarize stage emits atomic `{ statement, citations }` facts and drops a fact whose citations belong to two documents. A prompt-only "don't merge" rule is leaky; this makes cross-document conflation structurally impossible. Cross-document synthesis happens at compose time, where it is citation-gated.

### Constraints and edge cases

- **Scans are batched.** `wireWikiProject` scans changed sources 16 at a time and runs each batch through the whole pipeline before the next, so the topic/outlier indexes and the search index are written mid-build and already-indexed documents are searchable while a large build is running.
- **Artifacts live under the project system folder** (`<project>/.project/nature.wiki.json` for the wiki config, `<project>/.project/pages/<uri>/` per page, `<project>/.project/index/` for global indexes and the search index, `<project>/.project/snapshots/` for saved answers and reports). The project key is the resource path's first segment.
- **A bad document is isolated, not fatal.** Every per-page stage logs and skips on error (and marks the input handled so it is not retried until its source changes) rather than failing the whole pipeline.
- **Per-section facts live in the summary, not a separate graph.** The summarizer emits each section's `details` (exhaustive markdown facts) and `tables` (structured `{caption, columns, rows}`) in the same pass; query evidence is drawn from `summary` / `details` / `tables`. A separate entity/triple graph would need a second LLM pass over the same raw text and repeats subjects in every statement; one pass with three non-overlapping fields is cheaper and keeps tables structured.
- **Topic-index bounds are configurable.** `topicFanout` (default 10), `topicLeafCap` (default 25) and `documentChapterFanout` (default 8) are read from `nature.wiki.json`.
- **Snapshots are frozen and temporally versioned** — never auto-updated, never re-ingested as sources; re-running a subject creates a new dated snapshot.
- **`generateObject` retries once** on a schema-deviation (`NoObjectGeneratedError`) before surfacing the raw output; `normalizeMeta` deterministically drops blank-keyed topics and outliers missing the required `whySurprising` justification.

### What it depends on, and why

- `@statewalker/workspace.core` — the `Workspace`/`Project`/`Resource` model, `ResourceAdapter`/`ProjectAdapter`, and the `ProjectBuilder` build adapter (a `BuildEngine<Project>` from `@statewalker/webrun-builder`) the whole pipeline rides on.
- `@statewalker/content-extractors` — mime-aware text extraction registry (`createDefaultRegistry`) behind `ContentAdapter`.
- `@statewalker/indexer-api` / `-fulltext` / `-vector` / `-mem-flexsearch` — the FTS + vector index abstractions and the in-memory FlexSearch backend behind `SearchAdapter`.
- `@statewalker/fsm` (+ `-validator` in tests) — the query retrieval state machine.
- `@statewalker/webrun-files` — the `FilesApi` abstraction; production code is FilesApi-exclusive (no `node:fs`). `NodeFilesApi` is bound only at the CLI boundary (`bin/wiki.ts`), `MemFilesApi` in tests.
- `ai` + `@ai-sdk/openai` + `@ai-sdk/google` — the Vercel AI SDK and the two providers `resolveProvidersFromEnv` selects between.
- `@uwdata/flechette` — Arrow encoding/decoding for the embedding sidecars.
- `@statewalker/shared-adapters`, `-baseclass`, `-commands`, `-logger`, `-logger-pino` — adapter base classes, the command bus behind the `wiki:*` commands, and logging.
- `yaml`, `zod` — CLI YAML serialization and stage I/O schemas.

The React renderer for generated wiki sites is a separate package, `@statewalker/wiki.view.react`, so this package stays React-free.

## License

MIT. See [LICENSE](../../LICENSE).
