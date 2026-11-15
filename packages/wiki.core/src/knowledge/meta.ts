import { loggerOf, type RegisteredBuilder } from "@statewalker/workspace.core";
import { BuildTracer, buildSessionOf, llmOf, wikiConfigOf } from "../llm/index.js";
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
        (
          o,
        ): o is Partial<DocumentOutlier> & {
          key: string;
          whySurprising: string;
        } => filled(o.key) && filled(o.whySurprising),
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
export const META_BUILDER_ID = "MetaExtractor";

/** The `meta` row value: what identifies a meta version. */
function metaStamp(meta: DocumentMeta): { sourceHash: string; generated: string } {
  return { sourceHash: meta.sourceHash, generated: meta.generated };
}

/**
 * The meta builder: one task per `summarized` row. Extracts the document's topic/outlier
 * declarations (encouraging reuse of already-coined classes), writes `DocumentMeta` via
 * `WikiPageMeta`, and emits a `meta` row valued by its `{ sourceHash, generated }`. A
 * document whose topics changed gets a new value, so the reorganizer re-attributes it and
 * strips the references to the topics it no longer declares. Lifts wiki-runtime's
 * MetaExtractor.
 */
export function metaBuilder(opts: { force?: boolean } = {}): RegisteredBuilder {
  return {
    id: META_BUILDER_ID,
    inputs: [SUMMARIZED_SIGNAL],
    outputs: [META_SIGNAL],
    async run(ctx, project) {
      const uri = ctx.key;
      if ((await ctx.get(SUMMARIZED_SIGNAL, uri)) === undefined) return;
      const log = loggerOf(project, META_BUILDER_ID);
      const cfg = wikiConfigOf(project);
      const tracer = new BuildTracer(log, META_BUILDER_ID, buildSessionOf(project));
      const tracedLlm = tracer.wrap(llmOf(project));
      const system = fillCorpusPurpose(META_EXTRACTOR_SYSTEM_PROMPT, cfg.corpusPurpose);
      // The meta on disk before this run: re-emitted if the run fails (see the summarizer).
      let kept: DocumentMeta | undefined;
      try {
        const resource = await project.getProjectResource(uri);
        if (!resource) return;
        const summary = await resource.requireAdapter(WikiPageSummary).get();
        const hash = await resource.requireAdapter(ResourceTextContentCache).getRawMeta();
        const prior = await resource.requireAdapter(WikiPageMeta).get();
        kept = prior;
        const fresh =
          !!prior &&
          !!hash &&
          prior.sourceHash === hash.hash &&
          prior.schemaVersion === KNOWLEDGE_SCHEMA_VERSION;
        let meta: DocumentMeta | undefined = fresh ? prior : undefined;
        if (summary && (opts.force || !fresh)) {
          log.info("extracting meta", { uri });
          const existingClasses = await collectExistingClasses(project);
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
            input: { uri, summary: routingSummary, existingClasses },
            inputSchema: metaExtractorInputSchema,
            outputSchema: documentMetaSchema,
          });
          const { topics, outliers } = normalizeMeta(output);
          meta = {
            uri,
            generated: new Date().toISOString(),
            sourceHash: hash?.hash ?? "",
            schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
            topics,
            outliers,
          };
          await resource.requireAdapter(WikiPageMeta).write(meta);
        }
        // Emit whenever valid meta exists (written now or kept): a row the task stops
        // emitting is retracted, which would drop the document from the topic index.
        if (meta) ctx.emit(META_SIGNAL, uri, metaStamp(meta));
      } catch (error) {
        log.error("meta extraction failed; skipping document", {
          uri,
          error: error instanceof Error ? error.message : String(error),
        });
        if (kept) ctx.emit(META_SIGNAL, uri, metaStamp(kept));
      } finally {
        tracer.totals({ uri });
      }
    },
  };
}
