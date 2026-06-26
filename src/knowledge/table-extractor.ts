import {
  type BuilderUpdate,
  type EmittedUpdate,
  loggerOf,
  ProjectBuilder,
  type RegisteredBuilder,
} from "@statewalker/workspace.core";
import { BuildTracer, llmOf, wikiConfigOf } from "../llm/index.js";
import { toBatch } from "../util/batch.js";
import { ResourceTextContentCache, WikiPageSummary, WikiPageTables } from "./page-adapters.js";
import { TABLE_EXTRACT_SYSTEM_PROMPT } from "./prompts.js";
import { tableExtractInputSchema, tableExtractSchema } from "./schemas.js";
import { SUMMARIZED_SIGNAL } from "./summarizer.js";
import { type DetailTable, type DocumentTables, summaryLeaves } from "./types.js";

/** Signal emitted for each page whose structured tables are available/changed. */
export const TABLES_SIGNAL = "tables";
export const TABLE_EXTRACT_BUILDER_ID = "TableExtractor";

/** Documents whose tables are extracted in parallel per batch. */
const TABLE_BATCH_SIZE = 8;

/**
 * Deterministic cleanup after a (lenient) parse: drop rows whose cell count does not
 * match the table's columns, and drop tables left with no columns or no rows.
 */
function cleanTables(tables: DetailTable[]): DetailTable[] {
  return tables
    .map((t) => ({
      caption: t.caption,
      columns: t.columns,
      rows: t.rows.filter((r) => r.length === t.columns.length),
    }))
    .filter((t) => t.columns.length > 0 && t.rows.length > 0);
}

/**
 * The deferred table-extraction builder: consumes `summarized` and, for each leaf section
 * whose summary flagged table-like data (`hasTables`), extracts structured `DetailTable[]`
 * from that section's raw slice via one LLM call. Tables are persisted in `tables.json`
 * keyed by the section's key — attached to a section by construction, so there are no orphan
 * tables. Runs independently of (and in parallel with) meta/embedder; emits `tables`.
 */
export function tableExtractorBuilder(opts: { force?: boolean } = {}): RegisteredBuilder {
  return {
    id: TABLE_EXTRACT_BUILDER_ID,
    inputs: [SUMMARIZED_SIGNAL],
    outputs: [TABLES_SIGNAL],
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const log = loggerOf(project, TABLE_EXTRACT_BUILDER_ID);
      const llm = llmOf(project);
      const cfg = wikiConfigOf(project);
      const tracer = new BuildTracer(log, TABLE_EXTRACT_BUILDER_ID);
      const tracedLlm = tracer.wrap(llm);
      const source = builder.readUpdates({
        signal: SUMMARIZED_SIGNAL,
        cell: TABLE_EXTRACT_BUILDER_ID,
      });
      for await (const batch of toBatch(source, TABLE_BATCH_SIZE)) {
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
          if (resource && summary) {
            const flagged = summaryLeaves(summary).filter((s) => s.hasTables);
            // Cheap freshness gate (tables carry no own hash): skip when not forced and the
            // existing artifact already covers exactly the current flagged-section key set.
            const prior = await resource.requireAdapter(WikiPageTables).get();
            const sameKeys =
              !!prior &&
              Object.keys(prior).sort().join(",") ===
                flagged
                  .map((s) => s.key)
                  .sort()
                  .join(",");
            if (opts.force || !sameKeys) {
              log.info("extracting tables", { uri: u.uri, sections: flagged.length });
              const raw = await resource.requireAdapter(ResourceTextContentCache).getTextContent();
              const lines = raw.split("\n");
              const tables: DocumentTables = {};
              await Promise.all(
                flagged.map(async (s) => {
                  const content = lines.slice(s.startLine, s.endLine + 1).join("\n");
                  const { output } = await tracedLlm.generateObject({
                    name: "extract-tables",
                    description: "Extract structured tables from one section's raw content.",
                    model: cfg.modelFor("summarize"),
                    system: TABLE_EXTRACT_SYSTEM_PROMPT,
                    input: { title: s.title, summary: s.summary, hint: s.tableHints, content },
                    inputSchema: tableExtractInputSchema,
                    outputSchema: tableExtractSchema,
                  });
                  // Each table is attached to the section it was extracted from (no orphans);
                  // sections that yield no clean table get no entry.
                  const cleaned = cleanTables(output.tables);
                  if (cleaned.length > 0) tables[s.key] = cleaned;
                }),
              );
              await resource.requireAdapter(WikiPageTables).write(tables);
            }
            out.push({ signal: TABLES_SIGNAL, uri: u.uri, stamp: u.stamp });
          }
        } catch (error) {
          log.error("table extraction failed; skipping document", {
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
