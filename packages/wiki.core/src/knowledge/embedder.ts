import { loggerOf, type RegisteredBuilder } from "@statewalker/workspace.core";
import { llmOf, wikiConfigOf } from "../llm/index.js";
import { ResourceTextContentCache, WikiPageEmbeddings, WikiPageSummary } from "./page-adapters.js";
import { SUMMARIZED_SIGNAL } from "./summarizer.js";
import { type DocumentEmbeddings, KNOWLEDGE_SCHEMA_VERSION, summaryLeaves } from "./types.js";

export const EMBED_BUILDER_ID = "Embedder";
export const EMBEDDED_SIGNAL = "embedded";

/**
 * The embedder builder: a map builder over `summarized` that batch-embeds each
 * document's section summaries in a single call and stores the vectors beside the page
 * artifacts as `embeddings.<model>.<dim>.json` (+ Arrow sidecar). Emits an
 * `embedded/<uri>` fingerprint (`{ hash, v, model, dim, generated }`) for the
 * SearchIndexer to fold into the vector index; a document whose embeddings already
 * match the source hash (and model/dimensionality, via the filename) re-emits the same
 * fingerprint (cut-off). On a text-only wiki the upstream row passes straight through.
 * Reads the embedding model + dimensionality from `WikiLlmConfiguration` and embeds
 * via `LlmProjectAdapter`.
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
      // Text-only wiki (no embedding model/dimensionality): skip vector computation
      // entirely and pass the document straight through so the SearchIndexer
      // full-text-indexes it.
      if (model == null || dimensionality == null) {
        ctx.emit(EMBEDDED_SIGNAL, uri, summarized);
        return;
      }
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
        const fresh =
          !!prior &&
          !!hash &&
          prior.sourceHash === hash.hash &&
          prior.schemaVersion === KNOWLEDGE_SCHEMA_VERSION &&
          Array.isArray(prior.sections);
        let current: DocumentEmbeddings | undefined = fresh ? prior : undefined;
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
          const meta: DocumentEmbeddings = {
            uri,
            generated: new Date().toISOString(),
            sourceHash: hash?.hash ?? "",
            schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
            model,
            dimensionality,
            sections: keys,
          };
          await resource.requireAdapter(WikiPageEmbeddings).write(meta, vecs);
          current = meta;
        }
        if (current) {
          ctx.emit(EMBEDDED_SIGNAL, uri, {
            hash: current.sourceHash,
            v: current.schemaVersion,
            model: current.model,
            dim: current.dimensionality,
            generated: current.generated,
          });
        }
      } catch (error) {
        log.error("embedding failed", {
          uri,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}
