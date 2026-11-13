---
"@statewalker/wiki.core": minor
---

Move the wiki pipeline to the incremental `ProjectBuilder` of `@statewalker/workspace.core` 0.6
(`@statewalker/webrun-builder` 0.3). The per-document stages are map builders emitting fingerprint
rows (collection names unchanged: `content`, `summarized`, `meta`, `tables`, `embedded`,
`doc-topics-embedded`, `topic-tree`); a hash-skip re-emits the same fingerprint, so downstream
stages are cut off. Removals flow through retraction: `IndexPruner` deletes a removed source's page
artifacts in `dispose`, and `IndexReorganizer` and `SearchIndexer` are incremental reduce builders
that see removed rows as changes (the `meta-removed-topics` tombstones and
`META_REMOVED_TOPICS_SIGNAL` are gone). A failing document is no longer swallowed: it is retried,
then kept as a dead letter with its previous outputs. `WikiScanHandle.run()` now returns a promise of
the build result (`failures` included) and takes `{ onProgress }`; `status()` reports queued tasks per
stage; `restartFrom(stage)` re-runs a stage and its downstream (`restartWikiFrom`, `wikiStagesFrom`).
Builder state moves to `.project/state/build`: the first scan after upgrading re-checks every
document (hash-gated stages skip their LLM calls).
