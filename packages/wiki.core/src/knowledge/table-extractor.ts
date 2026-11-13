import { loggerOf, type RegisteredBuilder } from "@statewalker/workspace.core";
import { BuildTracer, buildSessionOf, llmOf, wikiConfigOf } from "../llm/index.js";
import { ResourceTextContentCache, WikiPageSummary, WikiPageTables } from "./page-adapters.js";
import { TABLE_EXTRACT_SYSTEM_PROMPT } from "./prompts.js";
import { tableExtractInputSchema, tableExtractSchema } from "./schemas.js";
import { SUMMARIZED_SIGNAL } from "./summarizer.js";
import { type DetailTable, type DocumentTables, summaryLeaves } from "./types.js";

/** Collection with one fingerprint row per page whose structured tables are available. */
export const TABLES_SIGNAL = "tables";
export const TABLE_EXTRACT_BUILDER_ID = "TableExtractor";

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
 * tables. Runs independently of (and in parallel with) meta/embedder; a map builder over
 * `summarized` that emits a `tables/<uri>` fingerprint.
 */
export function tableExtractorBuilder(opts: { force?: boolean } = {}): RegisteredBuilder {
  return {
    id: TABLE_EXTRACT_BUILDER_ID,
    inputs: [SUMMARIZED_SIGNAL],
    outputs: [TABLES_SIGNAL],
    async run(ctx, project) {
      const uri = ctx.key;
      const summarized = await ctx.get(SUMMARIZED_SIGNAL, uri);
      if (summarized === undefined) return;
      const log = loggerOf(project, TABLE_EXTRACT_BUILDER_ID);
      try {
        const resource = await project.getProjectResource(uri);
        const summary = await resource?.requireAdapter(WikiPageSummary).get();
        if (!resource || !summary) return;
        const flagged = summaryLeaves(summary).filter((s) => s.hasTables);
        const flaggedKeys = flagged.map((s) => s.key).sort();
        // Cheap freshness gate (tables carry no own hash): skip when not forced and the
        // existing artifact already covers exactly the current flagged-section key set.
        const prior = await resource.requireAdapter(WikiPageTables).get();
        const sameKeys = !!prior && Object.keys(prior).sort().join(",") === flaggedKeys.join(",");
        if (opts.force || !sameKeys) {
          log.info("extracting tables", { uri, sections: flagged.length });
          const cfg = wikiConfigOf(project);
          const tracer = new BuildTracer(log, TABLE_EXTRACT_BUILDER_ID, buildSessionOf(project));
          const tracedLlm = tracer.wrap(llmOf(project));
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
                input: {
                  title: s.title,
                  summary: s.summary,
                  hint: s.tableHints,
                  content,
                },
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
        // The fingerprint: the summary the tables were extracted from, plus the flagged sections.
        ctx.emit(TABLES_SIGNAL, uri, { summarized, sections: flaggedKeys });
      } catch (error) {
        log.error("table extraction failed", {
          uri,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}
