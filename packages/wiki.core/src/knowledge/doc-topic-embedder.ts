import {
  type BuilderUpdate,
  type EmittedUpdate,
  loggerOf,
  ProjectBuilder,
  type RegisteredBuilder,
} from "@statewalker/workspace.core";
import { llmOf, wikiConfigOf } from "../llm/index.js";
import { toBatch } from "../util/batch.js";
import { META_SIGNAL } from "./meta.js";
import { ResourceTextContentCache, WikiPageMeta } from "./page-adapters.js";
import { WikiPageTopicEmbeddings } from "./topic-embeddings.js";

export const DOC_TOPIC_EMBED_BUILDER_ID = "DocTopicEmbedder";
export const DOC_TOPICS_EMBEDDED_SIGNAL = "doc-topics-embedded";

/** Documents embedded in parallel per batch (each already batches its topics). */
const EMBED_BATCH_SIZE = 8;

/** The text a document topic is embedded by: its name plus abstract description. */
function topicText(t: { name: string; description?: string }): string {
  return t.description?.trim() ? `${t.name}\n${t.description.trim()}` : t.name;
}

/**
 * The document-topic embedder: on each `meta` change, batch-embeds every declared
 * document topic's `name + description` and stores the vectors beside the page
 * artifacts as `topic-embeddings.<model>.<dim>.arrow`. Mirrors the section
 * {@link import("./embedder.js").embedderBuilder}: `sourceHash`-gated, skips
 * unchanged sources, and on a text-only wiki (no embed model) passes the document
 * straight through. Emits `doc-topics-embedded` so the reorganizer attributes only
 * after the candidate vectors exist.
 */
export function docTopicEmbedderBuilder(opts: { force?: boolean } = {}): RegisteredBuilder {
  return {
    id: DOC_TOPIC_EMBED_BUILDER_ID,
    inputs: [META_SIGNAL],
    outputs: [DOC_TOPICS_EMBEDDED_SIGNAL],
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const log = loggerOf(project, DOC_TOPIC_EMBED_BUILDER_ID);
      const llm = llmOf(project);
      const cfg = wikiConfigOf(project);
      const model = cfg.embedModel;
      const dim = cfg.dimensionality;
      const source = builder.readUpdates({
        signal: META_SIGNAL,
        cell: DOC_TOPIC_EMBED_BUILDER_ID,
      });
      for await (const batch of toBatch(source, EMBED_BATCH_SIZE)) {
        for (const emitted of await Promise.all(batch.map(handleEntry))) yield* emitted;
        if (!(await builder.yieldControl())) return false;
      }
      return true;

      async function handleEntry(u: BuilderUpdate): Promise<EmittedUpdate[]> {
        const out: EmittedUpdate[] = [];
        try {
          // Text-only wiki: nothing to embed — pass the document straight through so
          // the reorganizer still attributes (degraded to key/alias + root-descent).
          if (model == null || dim == null) {
            out.push({ signal: DOC_TOPICS_EMBEDDED_SIGNAL, uri: u.uri, stamp: u.stamp });
            return out;
          }
          const resource = await project.getProjectResource(u.uri);
          const meta = await resource?.requireAdapter(WikiPageMeta).get();
          const hash = await resource?.requireAdapter(ResourceTextContentCache).getRawMeta();
          const prior = await resource?.requireAdapter(WikiPageTopicEmbeddings).getMeta(model, dim);
          const fresh = !!prior && !!hash && prior.sourceHash === hash.hash;
          if (resource && meta && (opts.force || !fresh)) {
            const topics = meta.topics;
            log.info("embedding document topics", { uri: u.uri, topics: topics.length });
            const vectors = topics.length ? await llm.embedBatch(topics.map(topicText), model) : [];
            const byKey = new Map<string, Float32Array>();
            topics.forEach((t, i) => {
              const v = vectors[i];
              if (v) byKey.set(t.key, v);
            });
            await resource
              .requireAdapter(WikiPageTopicEmbeddings)
              .write(model, dim, hash?.hash ?? "", byKey);
          }
          // Emit on a hash-skip too (vectors already on disk), so a re-run re-feeds
          // the reorganizer without re-embedding.
          if (resource)
            out.push({ signal: DOC_TOPICS_EMBEDDED_SIGNAL, uri: u.uri, stamp: u.stamp });
        } catch (error) {
          log.error("doc-topic embedding failed; skipping document", {
            uri: u.uri,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          await u.handled();
        }
        return out;
      }
    },
  };
}
