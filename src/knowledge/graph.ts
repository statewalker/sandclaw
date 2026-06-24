import {
  type BuilderUpdate,
  type EmittedUpdate,
  loggerOf,
  ProjectBuilder,
  type RegisteredBuilder,
} from "@statewalker/workspace.core";
import { llmOf, wikiConfigOf } from "../llm/index.js";
import { toBatch } from "../util/batch.js";
import { ResourceTextContentCache, WikiPageGraph, WikiPageSummary } from "./page-adapters.js";
import { fillCorpusPurpose, GRAPH_EXTRACTOR_SYSTEM_PROMPT } from "./prompts.js";
import { documentGraphSchema, graphExtractorInputSchema } from "./schemas.js";
import { SUMMARIZED_SIGNAL } from "./summarizer.js";
import type { DocumentGraph, Entity, SectionGraph, Triple } from "./types.js";

/** Signal emitted for each page whose graph is available/changed. */
export const GRAPH_SIGNAL = "graph";
export const GRAPH_BUILDER_ID = "GraphExtractor";

/** Documents whose graph is extracted in parallel per batch. */
const GRAPH_BATCH_SIZE = 8;

/**
 * Deterministic post-extraction validation. Drops any triple that is not
 * well-formed — three non-empty strings `[subject, predicate, object]`, optionally
 * followed by a 4th plain details object — or whose subject is not declared as an
 * entity.value somewhere in the document graph. The shape check lets the output
 * schema stay lenient (the model is not strictly constrained, so an off-shape triple
 * must not be allowed to fail the whole-document parse). Entity coverage is checked
 * against the WHOLE document, so a triple may reuse a subject from an earlier section.
 * Predicate, object, and details values are not otherwise validated.
 */
/** A triple as the (lenient) schema parses it: an array of anything. Shape is
 * validated here, not by the schema. */
type RawTriple = readonly unknown[];
/** A section graph as parsed: entities are typed, but triples are unconstrained. */
interface RawSectionGraph {
  sectionKey: string;
  entities: Entity[];
  statements: readonly RawTriple[];
  relations: readonly RawTriple[];
}

export function filterUnknownSubjects(sections: readonly RawSectionGraph[]): SectionGraph[] {
  const knownSubjects = new Set<string>();
  for (const s of sections) {
    for (const e of s.entities) knownSubjects.add(e.value);
  }
  // Keep [subject, predicate, object] (three non-empty strings) with an optional 4th
  // element that, when present, MUST be a plain details object. Subject must be a
  // declared entity.value. A type guard so the survivors narrow to `Triple`.
  const keep = (t: RawTriple): t is Triple => {
    if (t.length !== 3 && t.length !== 4) return false;
    const [subject, predicate, object, details] = t;
    if (typeof subject !== "string" || subject.length === 0) return false;
    if (typeof predicate !== "string" || predicate.length === 0) return false;
    if (typeof object !== "string" || object.length === 0) return false;
    if (
      t.length === 4 &&
      (typeof details !== "object" || details === null || Array.isArray(details))
    )
      return false;
    return knownSubjects.has(subject);
  };
  return sections.map((s) => ({
    sectionKey: s.sectionKey,
    entities: s.entities,
    statements: s.statements.filter(keep),
    relations: s.relations.filter(keep),
  }));
}

/**
 * The graph builder: consumes `summarized`, extracts per-section entities /
 * statements / relations, drops triples with unknown subjects, writes
 * `DocumentGraph` via `WikiPageGraph`, and emits `graph`. Lifts wiki-runtime's
 * GraphExtractor (without the LLM validation-retry loop).
 */
export function graphBuilder(opts: { force?: boolean } = {}): RegisteredBuilder {
  return {
    id: GRAPH_BUILDER_ID,
    inputs: [SUMMARIZED_SIGNAL],
    outputs: [GRAPH_SIGNAL],
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const log = loggerOf(project, GRAPH_BUILDER_ID);
      const llm = llmOf(project);
      const cfg = wikiConfigOf(project);
      const system = fillCorpusPurpose(GRAPH_EXTRACTOR_SYSTEM_PROMPT, cfg.corpusPurpose);
      const source = builder.readUpdates({
        signal: SUMMARIZED_SIGNAL,
        cell: GRAPH_BUILDER_ID,
      });
      for await (const batch of toBatch(source, GRAPH_BATCH_SIZE)) {
        for (const emitted of await Promise.all(batch.map(handleEntry))) yield* emitted;
        if (!(await builder.yieldControl())) return false;
      }
      return true;

      async function handleEntry(u: BuilderUpdate): Promise<EmittedUpdate[]> {
        const out: EmittedUpdate[] = [];
        try {
          const resource = await project.getProjectResource(u.uri);
          const summary = await resource?.requireAdapter(WikiPageSummary).get();
          const hash = await resource?.requireAdapter(ResourceTextContentCache).getRawMeta();
          const prior = await resource?.requireAdapter(WikiPageGraph).get();
          const fresh = !!prior && !!hash && prior.sourceHash === hash.hash;
          if (resource && summary && (opts.force || !fresh)) {
            log.info("extracting graph", { uri: u.uri });
            // The summary frames the extraction (build-order/context dependency on the
            // summarizer); the raw block is the SOURCE of facts (information dependency).
            const raw = await resource.requireAdapter(ResourceTextContentCache).getTextContent();
            const rawLines = raw.split("\n");
            const sections = summary.sections.map((s) => ({
              key: s.key,
              title: s.title,
              summary: s.summary,
              raw: rawLines.slice(s.startLine, s.endLine + 1).join("\n"),
            }));
            const { output } = await llm.generateObject({
              name: "extract-document-graph",
              description:
                "Per-section structured signal: entities plus [subject, predicate, object] statements (object is a literal) and relations (object is an entity). Subject is always an entity.value.",
              model: cfg.modelFor("graph"),
              system,
              input: { uri: u.uri, sections },
              inputSchema: graphExtractorInputSchema,
              outputSchema: documentGraphSchema,
            });

            const graph: DocumentGraph = {
              uri: u.uri,
              generated: new Date().toISOString(),
              sourceHash: hash?.hash ?? "",
              sections: filterUnknownSubjects(output.sections),
            };
            await resource.requireAdapter(WikiPageGraph).write(graph);
            out.push({ signal: GRAPH_SIGNAL, uri: u.uri, stamp: u.stamp });
          }
        } catch (error) {
          // Surface the underlying validation cause (and finishReason) when the
          // AI SDK throws NoObjectGeneratedError, otherwise the failure is opaque.
          const detail = error as { cause?: unknown; finishReason?: unknown } | undefined;
          log.error("graph extraction failed; skipping document", {
            uri: u.uri,
            error: error instanceof Error ? error.message : String(error),
            cause: detail?.cause instanceof Error ? detail.cause.message : undefined,
            finishReason: detail?.finishReason,
          });
        } finally {
          await u.handled();
        }
        return out;
      }
    },
  };
}
