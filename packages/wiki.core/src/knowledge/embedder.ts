import { loggerOf, type RegisteredBuilder } from "@statewalker/workspace.core";
import { llmOf, wikiConfigOf } from "../llm/index.js";
import { ResourceTextContentCache, WikiPageEmbeddings, WikiPageSummary } from "./page-adapters.js";
import { SUMMARIZED_SIGNAL } from "./summarizer.js";
import { type DocumentEmbeddings, KNOWLEDGE_SCHEMA_VERSION, summaryLeaves } from "./types.js";

export const EMBED_BUILDER_ID = "Embedder";
export const EMBEDDED_SIGNAL = "embedded";

/** The `embedded` row value: what identifies an embeddings version. */
function embeddingsStamp(e: DocumentEmbeddings): { sourceHash: string; generated: string } {
  return { sourceHash: e.sourceHash, generated: e.generated };
}

/**
 * The embedder builder: one task per `summarized` row. Batch-embeds the document's section
 * summaries in a single call and stores the vectors beside the page artifacts as
 * `embeddings.<model>.<dim>.json` (+ the Arrow sidecar). Emits an `embedded` row, valued by
 * the embeddings' `{ sourceHash, generated }`, for the SearchIndexer to fold into the vector
 * index. Skips documents whose embeddings already match the source hash (and
 * model/dimensionality, via the filename). Reads the embedding model + dimensionality from
 * `WikiLlmConfiguration` and embeds via `LlmProjectAdapter`.
 */
export function embedderBuilder(opts: { force?: boolean } = {}): RegisteredBuilder {
  return {
    id: EMBED_BUILDER_ID,
    inputs: [SUMMARIZED_SIGNAL],
    outputs: [EMBEDDED_SIGNAL],
    async run(ctx, project) {
      const uri = ctx.key;
      const summarized = await ctx.get(SUMMARIZED_SIGNAL, uri);
      if (summarized === undefined) return;
      const log = loggerOf(project, EMBED_BUILDER_ID);
      const cfg = wikiConfigOf(project);
      const model = cfg.embedModel;
      const dimensionality = cfg.dimensionality;
      // Text-only wiki (no embedding model/dimensionality): skip vector computation entirely
      // and pass the document straight through so the SearchIndexer full-text-indexes it.
      if (model == null || dimensionality == null) {
        ctx.emit(EMBEDDED_SIGNAL, uri, summarized);
        return;
      }
      // The embeddings on disk before this run: re-emitted if the run fails (see the summarizer).
      let kept: DocumentEmbeddings | undefined;
      try {
        const resource = await project.getProjectResource(uri);
        if (!resource) return;
        const summary = await resource.requireAdapter(WikiPageSummary).get();
        const hash = await resource.requireAdapter(ResourceTextContentCache).getRawMeta();
        const prior = await resource
          .requireAdapter(WikiPageEmbeddings)
          .getMeta(model, dimensionality);
        // `Array.isArray(prior.sections)` also rejects the legacy JSON format
        // (vectors inlined as a `Record`), so pre-Arrow embeddings are re-embedded.
        const valid = !!prior && Array.isArray(prior.sections);
        if (valid) kept = prior;
        const fresh =
          valid &&
          !!hash &&
          prior.sourceHash === hash.hash &&
          prior.schemaVersion === KNOWLEDGE_SCHEMA_VERSION;
        let embeddings: DocumentEmbeddings | undefined = fresh ? prior : undefined;
        if (summary && (opts.force || !fresh)) {
          const leaves = summaryLeaves(summary);
          log.info("embedding sections", { uri, sections: leaves.length });
          // One batched embedding call per document. Embed the routing payload
          // (title + summary) — the same text the routing tier sees — so
          // fact-specific queries recall the right section.
          const vectors = leaves.length
            ? await llmOf(project).embedBatch(
                leaves.map((s) => `${s.title}\n${s.summary}`),
                model,
              )
            : [];
          // Keep keys + vectors aligned, dropping any section that failed to embed.
          const keys: string[] = [];
          const vecs: Float32Array[] = [];
          leaves.forEach((s, i) => {
            const v = vectors[i];
            if (v) {
              keys.push(s.key);
              vecs.push(v);
            }
          });
          embeddings = {
            uri,
            generated: new Date().toISOString(),
            sourceHash: hash?.hash ?? "",
            schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
            model,
            dimensionality,
            sections: keys,
          };
          await resource.requireAdapter(WikiPageEmbeddings).write(embeddings, vecs);
        }
        // Emit whenever valid embeddings exist (written now or kept): a row the task stops
        // emitting is retracted, which would remove the page from the search index.
        if (embeddings) ctx.emit(EMBEDDED_SIGNAL, uri, embeddingsStamp(embeddings));
      } catch (error) {
        log.error("embedding failed; skipping document", {
          uri,
          error: error instanceof Error ? error.message : String(error),
        });
        if (kept) ctx.emit(EMBEDDED_SIGNAL, uri, embeddingsStamp(kept));
      }
    },
  };
}
