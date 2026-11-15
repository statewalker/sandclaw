---
"@statewalker/wiki.core": minor
---

Move to `@statewalker/workspace.core` 0.7 (kernel 0.7, ai 0.6, shell-react views 0.3): the build pipeline runs on the `@statewalker/webrun-builder` engine.

- Every builder is a `BuilderDef` over collections keyed by the document's project path (`sources` → `content` → `summarized` → `meta` / `tables` / `embedded` → `doc-topics-embedded` → `topic-tree`). `IndexReorganizer` and `SearchIndexer` are incremental reduces; the pruner deletes a removed source's artifacts from its `dispose`.
- Breaking: `META_REMOVED_TOPICS_SIGNAL` is gone (a document whose topics change is re-attributed through its `meta` row). `WikiScanHandle.run()` yields `ProjectBuildStep`s and `status()` returns `{ queued, deadLetters }`. `restartFrom(stage)` re-runs that stage; the stages below re-run only where its outputs change. New `restartWikiBuilders(builder)` queues every stage, and `scan({ force: true })` / the CLI's `scan … force` use it.
- A document whose stage fails keeps its previous artifacts downstream instead of being dropped from the indexes.

**Migration:** there is no state migration. The 0.1 engine's `.project/state/*.json` files are no longer read (they can be deleted); the new state lives in `.project/state/build`. The first scan after the upgrade runs every stage over every document: pages whose artifacts match their source hash are kept without LLM calls, the topic index is re-attributed (topic attribution may call the LLM), the search index is re-indexed, and pages without valid artifacts are processed in full.

**Rollback:** stay on, or return to, `@statewalker/wiki.core` 0.1.x with `@statewalker/workspace.core` 0.5.x. It ignores `.project/state/build` and reuses the page artifacts by source hash; artifact formats are unchanged.
