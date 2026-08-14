import {
  type BuilderUpdate,
  type EmittedUpdate,
  loggerOf,
  ProjectBuilder,
  type RegisteredBuilder,
} from "@statewalker/workspace.core";
import { BuildTracer, buildSessionOf, llmOf, wikiConfigOf } from "../llm/index.js";
import { toBatch } from "../util/batch.js";
import { collectExistingClasses } from "./indexes.js";
import { ResourceTextContentCache, WikiPageMeta, WikiPageSummary } from "./page-adapters.js";
import { fillCorpusPurpose, META_EXTRACTOR_SYSTEM_PROMPT } from "./prompts.js";
import { documentMetaSchema, metaExtractorInputSchema } from "./schemas.js";
import { SUMMARIZED_SIGNAL } from "./summarizer.js";
import {
  type DocumentMeta,
  type DocumentOutlier,
  type DocumentTopic,
  KNOWLEDGE_SCHEMA_VERSION,
  summaryLeaves,
} from "./types.js";

/**
 * Enforce meta shape deterministically after a (lenient) parse: every schema
 * field is optional, so a non-strict model omitting one (commonly `brief`, or a
 * blank `key`) never throws and drops the whole document (mirrors the summarizer's
 * `cleanTables`). Here we drop declarations missing the
 * fields that carry meaning — a blank `key`, or an outlier lacking its
 * `whySurprising` justification — and default the rest so downstream consumers
 * always see well-formed declarations.
 */
export function normalizeMeta(raw: {
  topics?: Partial<DocumentTopic>[];
  outliers?: Partial<DocumentOutlier>[];
}): {
  topics: DocumentTopic[];
  outliers: DocumentOutlier[];
} {
  const filled = (s?: string) => !!s && s.trim().length > 0;
  return {
    topics: (raw.topics ?? [])
      .filter((t): t is Partial<DocumentTopic> & { key: string } => filled(t.key))
      .map((t) => ({
        key: t.key,
        name: t.name ?? t.key,
        description: t.description,
        sectionKeys: t.sectionKeys ?? [],
        brief: t.brief ?? "",
      })),
    outliers: (raw.outliers ?? [])
      .filter(
        (o): o is Partial<DocumentOutlier> & { key: string; whySurprising: string } =>
          filled(o.key) && filled(o.whySurprising),
      )
      .map((o) => ({
        key: o.key,
        name: o.name ?? o.key,
        description: o.description,
        globalClass: o.globalClass,
        sectionKeys: o.sectionKeys ?? [],
        brief: o.brief ?? "",
        whySurprising: o.whySurprising,
      })),
  };
}

/** Signal emitted for each page whose topic/outlier declarations are available/changed. */
export const META_SIGNAL = "meta";
/** Tombstone signal: a `<uri>#<topicKey>` declaration was removed (drives the pruner). */
export const META_REMOVED_TOPICS_SIGNAL = "meta-removed-topics";
export const META_BUILDER_ID = "MetaExtractor";

/** Documents whose meta is extracted in parallel per batch. */
const META_BATCH_SIZE = 8;

/**
 * The meta builder: consumes `summarized`, extracts per-document topic/outlier
 * declarations (encouraging reuse of already-coined classes), writes `DocumentMeta`
 * via `WikiPageMeta`, emits `meta`, and emits `meta:removed-topics` tombstones for
 * topics that were present before but are gone now. Lifts wiki-runtime's MetaExtractor.
 */
export function metaBuilder(opts: { force?: boolean } = {}): RegisteredBuilder {
  return {
    id: META_BUILDER_ID,
    inputs: [SUMMARIZED_SIGNAL],
    outputs: [META_SIGNAL, META_REMOVED_TOPICS_SIGNAL],
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const log = loggerOf(project, META_BUILDER_ID);
      const llm = llmOf(project);
      const cfg = wikiConfigOf(project);
      const tracer = new BuildTracer(log, META_BUILDER_ID, buildSessionOf(project));
      const tracedLlm = tracer.wrap(llm);
      const system = fillCorpusPurpose(META_EXTRACTOR_SYSTEM_PROMPT, cfg.corpusPurpose);
      const existingClasses = await collectExistingClasses(project);
      const source = builder.readUpdates({
        signal: SUMMARIZED_SIGNAL,
        cell: META_BUILDER_ID,
      });
      for await (const batch of toBatch(source, META_BATCH_SIZE)) {
        for (const emitted of await Promise.all(batch.map(handleEntry))) yield* emitted;
        if (!(await builder.yieldControl())) return false;
      }
      tracer.totals();
      return true;

      async function handleEntry(u: BuilderUpdate): Promise<EmittedUpdate[]> {
        const out: EmittedUpdate[] = [];
        try {
          const resource = await project.getProjectResource(u.uri);
          const summary = await resource?.requireAdapter(WikiPageSummary).get();
          const hash = await resource?.requireAdapter(ResourceTextContentCache).getRawMeta();
          const prior = await resource?.requireAdapter(WikiPageMeta).get();
          const fresh =
            !!prior &&
            !!hash &&
            prior.sourceHash === hash.hash &&
            prior.schemaVersion === KNOWLEDGE_SCHEMA_VERSION;
          let produced = false;
          if (resource && summary && (opts.force || !fresh)) {
            log.info("extracting meta", { uri: u.uri });
            // The routing payload only: document title + summary + per-leaf title/summary.
            const routingSummary = {
              title: summary.title,
              summary: summary.summary,
              sections: summaryLeaves(summary).map((s) => ({
                key: s.key,
                title: s.title,
                summary: s.summary,
              })),
            };
            const { output } = await tracedLlm.generateObject({
              name: "extract-document-meta",
              description:
                "Declare the topic and outlier classes covered by this document. Reuse existing class keys; copy their description verbatim. Mark outliers only when the source itself flags surprise.",
              model: cfg.modelFor("meta"),
              system,
              input: { uri: u.uri, summary: routingSummary, existingClasses },
              inputSchema: metaExtractorInputSchema,
              outputSchema: documentMetaSchema,
            });

            const { topics, outliers } = normalizeMeta(output);
            const meta: DocumentMeta = {
              uri: u.uri,
              generated: new Date().toISOString(),
              sourceHash: hash?.hash ?? "",
              schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
              topics,
              outliers,
            };
            await resource.requireAdapter(WikiPageMeta).write(meta);
            produced = true;

            if (prior) {
              const newKeys = new Set(meta.topics.map((t) => t.key));
              for (const t of prior.topics) {
                if (!newKeys.has(t.key)) {
                  out.push({
                    signal: META_REMOVED_TOPICS_SIGNAL,
                    uri: `${u.uri}#${t.key}`,
                    stamp: u.stamp,
                  });
                }
              }
            }
          }
          // Emit on a hash-skip too (valid meta already on disk), so a re-run after
          // invalidation re-feeds the index reorganizer without re-extracting.
          if (resource && (produced || fresh)) {
            out.push({ signal: META_SIGNAL, uri: u.uri, stamp: u.stamp });
          }
        } catch (error) {
          log.error("meta extraction failed; skipping document", {
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
