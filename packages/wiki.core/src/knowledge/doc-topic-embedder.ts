import { loggerOf, type RegisteredBuilder } from "@statewalker/workspace.core";
import { llmOf, wikiConfigOf } from "../llm/index.js";
import { META_SIGNAL } from "./meta.js";
import { ResourceTextContentCache, WikiPageMeta } from "./page-adapters.js";
import { WikiPageTopicEmbeddings } from "./topic-embeddings.js";

export const DOC_TOPIC_EMBED_BUILDER_ID = "DocTopicEmbedder";
export const DOC_TOPICS_EMBEDDED_SIGNAL = "doc-topics-embedded";

/** The text a document topic is embedded by: its name plus abstract description. */
function topicText(t: { name: string; description?: string }): string {
  return t.description?.trim() ? `${t.name}\n${t.description.trim()}` : t.name;
}

/**
 * The document-topic embedder: one task per `meta` row. Batch-embeds every declared
 * document topic's `name + description` and stores the vectors beside the page artifacts as
 * `topic-embeddings.<model>.<dim>.arrow`. Mirrors the section
 * {@link import("./embedder.js").embedderBuilder}: `sourceHash`-gated, skips unchanged
 * sources, and on a text-only wiki (no embed model) passes the document straight through.
 * Emits a `doc-topics-embedded` row valued by the `meta` row it embedded, so the reorganizer
 * attributes a document only after its candidate vectors exist, and again whenever its meta
 * changes.
 */
export function docTopicEmbedderBuilder(opts: { force?: boolean } = {}): RegisteredBuilder {
  return {
    id: DOC_TOPIC_EMBED_BUILDER_ID,
    inputs: [META_SIGNAL],
    outputs: [DOC_TOPICS_EMBEDDED_SIGNAL],
    async run(ctx, project) {
      const uri = ctx.key;
      const metaStamp = await ctx.get(META_SIGNAL, uri);
      if (metaStamp === undefined) return;
      const log = loggerOf(project, DOC_TOPIC_EMBED_BUILDER_ID);
      const cfg = wikiConfigOf(project);
      const model = cfg.embedModel;
      const dim = cfg.dimensionality;
      try {
        // Text-only wiki: nothing to embed — pass the document straight through so the
        // reorganizer still attributes (degraded to key/alias + root-descent).
        if (model == null || dim == null) return;
        const resource = await project.getProjectResource(uri);
        const meta = await resource?.requireAdapter(WikiPageMeta).get();
        const hash = await resource?.requireAdapter(ResourceTextContentCache).getRawMeta();
        const prior = await resource?.requireAdapter(WikiPageTopicEmbeddings).getMeta(model, dim);
        const fresh = !!prior && !!hash && prior.sourceHash === hash.hash;
        if (resource && meta && (opts.force || !fresh)) {
          const topics = meta.topics;
          log.info("embedding document topics", { uri, topics: topics.length });
          const vectors = topics.length
            ? await llmOf(project).embedBatch(topics.map(topicText), model)
            : [];
          const byKey = new Map<string, Float32Array>();
          topics.forEach((t, i) => {
            const v = vectors[i];
            if (v) byKey.set(t.key, v);
          });
          await resource
            .requireAdapter(WikiPageTopicEmbeddings)
            .write(model, dim, hash?.hash ?? "", byKey);
        }
      } catch (error) {
        // The reorganizer still attributes the document, without (fresh) topic vectors:
        // retracting the row instead would strip the document from the topic index.
        log.error("doc-topic embedding failed; attributing without vectors", {
          uri,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        ctx.emit(DOC_TOPICS_EMBEDDED_SIGNAL, uri, metaStamp);
      }
    },
  };
}
