# @statewalker/wiki.core

## 0.4.0

### Minor Changes

- Release of the changes since the last published version:
  
  - @statewalker/indexer-mem-flexsearch ^0.2.0 -> ^0.4.0

## 0.3.0

### Minor Changes

- Release of the changes since the last published version:
  
  - @statewalker/indexer-api ^0.1.0 -> ^0.1.5
  - @statewalker/indexer-fulltext ^0.1.0 -> ^0.1.6
  - @statewalker/indexer-mem-flexsearch ^0.1.0 -> ^0.2.0
  - @statewalker/indexer-vector ^0.1.0 -> ^0.1.6

## 0.2.0

### Minor Changes

- ebf50ca: Move to `@statewalker/workspace.core` 0.7 (kernel 0.7, ai 0.6, shell-react views 0.3): the build pipeline runs on the `@statewalker/webrun-builder` engine.
  
  - Every builder is a `BuilderDef` over collections keyed by the document's project path (`sources` → `content` → `summarized` → `meta` / `tables` / `embedded` → `doc-topics-embedded` → `topic-tree`). `IndexReorganizer` and `SearchIndexer` are incremental reduces; the pruner deletes a removed source's artifacts from its `dispose`.
  - Breaking: `META_REMOVED_TOPICS_SIGNAL` is gone (a document whose topics change is re-attributed through its `meta` row). `WikiScanHandle.run()` yields `ProjectBuildStep`s and `status()` returns `{ queued, deadLetters }`. `restartFrom(stage)` re-runs that stage; the stages below re-run only where its outputs change. New `restartWikiBuilders(builder)` queues every stage, and `scan({ force: true })` / the CLI's `scan … force` use it.
  - A document whose stage fails keeps its previous artifacts downstream instead of being dropped from the indexes.
  
  **Migration:** there is no state migration. The 0.1 engine's `.project/state/*.json` files are no longer read (they can be deleted); the new state lives in `.project/state/build`. The first scan after the upgrade runs every stage over every document: pages whose artifacts match their source hash are kept without LLM calls, the topic index is re-attributed (topic attribution may call the LLM), the search index is re-indexed, and pages without valid artifacts are processed in full. A source deleted before that scan is swept (new `orphanSweepBuilder`: artifact folder deleted, removed from the search index, topic references stripped); documents not scanned yet keep their place in the indexes.
  
  **Rollback:** stay on, or return to, `@statewalker/wiki.core` 0.1.x with `@statewalker/workspace.core` 0.5.x. It ignores `.project/state/build` and reuses the page artifacts by source hash; artifact formats are unchanged.

## 0.1.3

### Patch Changes

- Release of the changes since the last published version:
  
  - zod ^4.6.5 -> ^4.6.6

## 0.1.2

### Patch Changes

- Release of the changes since the last published version:
  
  - files changed: README.md, dist/knowledge/doc-topic-embedder.js.map, dist/knowledge/embedder.js.map, dist/knowledge/index.d.ts.map, dist/knowledge/index.js.map, 60 more
