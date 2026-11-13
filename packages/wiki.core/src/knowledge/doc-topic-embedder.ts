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
 * The document-topic embedder: a map builder over `meta` that batch-embeds every
 * declared document topic's `name + description` and stores the vectors beside the
 * page artifacts as `topic-embeddings.<model>.<dim>.arrow`. Mirrors the section
 * {@link import("./embedder.js").embedderBuilder}: `sourceHash`-gated, skips
 * unchanged sources, and on a text-only wiki (no embed model) passes the document
 * straight through. Emits `doc-topics-embedded/<uri>` carrying the upstream `meta`
 * fingerprint (topic keys included), so the reorganizer attributes only after the
 * candidate vectors exist and re-attributes a document whose declarations changed.
 */
export function docTopicEmbedderBuilder(opts: { force?: boolean } = {}): RegisteredBuilder {
  return {
    id: DOC_TOPIC_EMBED_BUILDER_ID,
    inputs: [META_SIGNAL],
    outputs: [DOC_TOPICS_EMBEDDED_SIGNAL],
    async run(ctx, project) {
      const uri = ctx.key;
      const metaRow = await ctx.get(META_SIGNAL, uri);
      if (metaRow === undefined) return;
      const log = loggerOf(project, DOC_TOPIC_EMBED_BUILDER_ID);
      const cfg = wikiConfigOf(project);
      const model = cfg.embedModel;
      const dim = cfg.dimensionality;
      // Text-only wiki: nothing to embed — pass the document straight through so
      // the reorganizer still attributes (degraded to key/alias + root-descent).
      if (model == null || dim == null) {
        ctx.emit(DOC_TOPICS_EMBEDDED_SIGNAL, uri, metaRow);
        return;
      }
      try {
        const resource = await project.getProjectResource(uri);
        if (!resource) return;
        const meta = await resource.requireAdapter(WikiPageMeta).get();
        const hash = await resource.requireAdapter(ResourceTextContentCache).getRawMeta();
        const prior = await resource.requireAdapter(WikiPageTopicEmbeddings).getMeta(model, dim);
        const fresh = !!prior && !!hash && prior.sourceHash === hash.hash;
        if (meta && (opts.force || !fresh)) {
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
        // Emit on a hash-skip too (vectors already on disk): the row only changes
        // when the document's declarations do, so the reorganizer is cut off otherwise.
        ctx.emit(DOC_TOPICS_EMBEDDED_SIGNAL, uri, metaRow);
      } catch (error) {
        log.error("doc-topic embedding failed", {
          uri,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}
