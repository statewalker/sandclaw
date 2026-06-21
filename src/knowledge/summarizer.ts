import {
  type BuilderUpdate,
  type EmittedUpdate,
  loggerOf,
  ProjectBuilder,
  type RegisteredBuilder,
} from "@statewalker/workspace.core";
import { CONTENT_SIGNAL } from "../content/index.js";
import { type LlmApi, llmOf, type WikiLlmConfiguration, wikiConfigOf } from "../llm/index.js";
import { toBatch } from "../util/batch.js";
import { ResourceTextContentCache, WikiPageSummary } from "./page-adapters.js";
import {
  AGGREGATE_CHAPTERS_SYSTEM_PROMPT,
  fillCorpusPurpose,
  SUMMARIZER_SYSTEM_PROMPT,
} from "./prompts.js";
import {
  aggregateChaptersInputSchema,
  aggregateChaptersSchema,
  documentSummarySchema,
  summarizerInputSchema,
} from "./schemas.js";
import type { ChapterNode, DocumentSummary, SectionSummary } from "./types.js";

/** Signal emitted for each page whose L2 summary (Sections) is available/changed. */
export const SUMMARIZED_SIGNAL = "summarized";

/** Cell id of the summarizer builder. */
export const SUMMARIZE_BUILDER_ID = "Summarizer";

/** Documents summarized in parallel per batch. */
const SUMMARIZE_BATCH_SIZE = 8;

/** Max characters of raw text fed to one sectioning block (context-window proxy). */
const SECTION_BLOCK_CHARS = 24_000;

/** Kebab-case slug from a title (ASCII alphanumeric + '-'); falls back when empty. */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/** Append `-2`, `-3`, … to duplicate keys so every key is unique (stable by document order). */
function dedupeKeys<T extends { key: string }>(items: T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((it) => {
    const n = (seen.get(it.key) ?? 0) + 1;
    seen.set(it.key, n);
    return n === 1 ? it : { ...it, key: `${it.key}-${n}` };
  });
}

/**
 * Section a document by walking it in context-window-sized blocks of numbered lines. For a
 * non-final block the last (possibly cut) section is dropped and the next block restarts at its
 * start (the last kept section's end), with that section's summary supplied as rolling context;
 * a lone-section block is kept to guarantee progress. Returns the document title (from the first
 * block), the first block's document-level summary (a base for the small-document outline), and
 * the assembled flat sections covering the whole document.
 */
export async function sectionizeDocument(
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  system: string,
  uri: string,
  text: string,
  blockChars: number = SECTION_BLOCK_CHARS,
): Promise<{ title: string; baseSummary: string; sections: SectionSummary[] }> {
  const lines = text.split("\n");
  const total = lines.length;
  const sections: SectionSummary[] = [];
  let title = "";
  let baseSummary = "";
  let start = 0;
  let previousSection: string | undefined;

  while (start < total) {
    // Grow a block from `start` until the char budget is spent (always ≥1 line).
    let end = start;
    let chars = 0;
    while (end < total) {
      const line = lines[end];
      if (line === undefined) break;
      const cost = line.length + 1;
      if (end !== start && chars + cost > blockChars) break;
      chars += cost;
      end++;
    }
    const isFinal = end >= total;
    const rawLines = lines
      .slice(start, end)
      .map((line, i) => [start + i, line] as [number, string]);

    const { output } = await llm.generateObject({
      name: "summarize-document",
      description:
        "Section a block of a document — title, a document-level summary, and ordered section entries each with a kebab-case key and a 0-indexed [startLine, endLine] range over the block's absolute line numbers.",
      model: cfg.modelFor("summarize"),
      system,
      input: { uri, rawLines, previousSection },
      inputSchema: summarizerInputSchema,
      outputSchema: documentSummarySchema,
    });
    if (!title) title = output.title;
    if (!baseSummary) baseSummary = output.summary;
    if (output.sections.length === 0) break; // nothing to place — stop the walk

    if (isFinal) {
      sections.push(...output.sections);
      break;
    }
    // Drop the last (possibly mid-section-cut) section unless it is the only one.
    const keep = output.sections.length > 1 ? output.sections.slice(0, -1) : output.sections;
    sections.push(...keep);
    const last = keep[keep.length - 1];
    if (!last) break;
    previousSection = last.summary;
    // Restart at the dropped section's start; never go backwards or stall (force past the block).
    start = last.endLine + 1 > start ? last.endLine + 1 : end;
  }

  return { title: title || uri, baseSummary, sections: dedupeKeys(sections) };
}

/** One chapter-aggregation round: group ordered members into chapters (mapped to nodes via `attach`). */
async function aggregateLevel(
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  system: string,
  members: { key: string; title: string; summary: string }[],
  attach: (memberKeys: string[]) => Pick<ChapterNode, "sectionKeys" | "children">,
): Promise<ChapterNode[]> {
  const { output } = await llm.generateObject({
    name: "aggregate-chapters",
    description: "Group ordered sections or sub-chapters into coherent, contiguous chapters.",
    model: cfg.modelFor("summarize"),
    system,
    input: { members: members.map((m) => ({ key: m.key, title: m.title, summary: m.summary })) },
    inputSchema: aggregateChaptersInputSchema,
    outputSchema: aggregateChaptersSchema,
  });
  const byKey = new Set(members.map((m) => m.key));
  const chapters = output.chapters
    .map((c) => ({
      key: slugify(c.title),
      title: c.title,
      summary: c.summary,
      ...attach(c.memberKeys.filter((k) => byKey.has(k))),
    }))
    .filter((c) => (c.sectionKeys?.length ?? c.children?.length ?? 0) > 0);
  return dedupeKeys(chapters);
}

/**
 * Build the document outline from the assembled sections. A small section set (≤ the chapter
 * fan-out) is wrapped mechanically in one chapter — no LLM call — so the common single-block
 * document keeps its existing one-call shape. A larger set is grouped into leaf chapters, then
 * re-aggregated into super-chapters while a level exceeds the fan-out. The document summary is the
 * first block's summary for the trivial case, else synthesised from the top-level chapter summaries.
 */
export async function buildOutline(
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  system: string,
  title: string,
  baseSummary: string,
  sections: SectionSummary[],
): Promise<{ outline: ChapterNode[]; summary: string }> {
  const fanout = cfg.documentChapterFanout;
  if (sections.length <= fanout) {
    return {
      outline: [
        { key: "outline", title, summary: baseSummary, sectionKeys: sections.map((s) => s.key) },
      ],
      summary: baseSummary,
    };
  }
  let level = await aggregateLevel(llm, cfg, system, sections, (memberKeys) => ({
    sectionKeys: memberKeys,
  }));
  while (level.length > fanout) {
    const parents = level;
    level = await aggregateLevel(llm, cfg, system, parents, (memberKeys) => ({
      children: memberKeys
        .map((k) => parents.find((p) => p.key === k))
        .filter((p): p is ChapterNode => !!p),
    }));
  }
  return { outline: level, summary: level.map((c) => c.summary).join(" ") };
}

/**
 * The summarizer builder: consumes `content`, sections each page block-by-block, builds its
 * outline, writes the `DocumentSummary` via `WikiPageSummary`, and emits `summarized`.
 */
export function summarizeBuilder(opts: { force?: boolean } = {}): RegisteredBuilder {
  return {
    id: SUMMARIZE_BUILDER_ID,
    inputs: [CONTENT_SIGNAL],
    outputs: [SUMMARIZED_SIGNAL],
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const log = loggerOf(project, SUMMARIZE_BUILDER_ID);
      const llm = llmOf(project);
      const cfg = wikiConfigOf(project);
      const system = fillCorpusPurpose(SUMMARIZER_SYSTEM_PROMPT, cfg.corpusPurpose);
      const chapterSystem = fillCorpusPurpose(AGGREGATE_CHAPTERS_SYSTEM_PROMPT, cfg.corpusPurpose);
      const source = builder.readUpdates({
        signal: CONTENT_SIGNAL,
        cell: SUMMARIZE_BUILDER_ID,
      });
      for await (const batch of toBatch(source, SUMMARIZE_BATCH_SIZE)) {
        for (const emitted of await Promise.all(batch.map(handleEntry))) yield* emitted;
        if (!(await builder.yieldControl())) return false;
      }
      return true;

      async function handleEntry(u: BuilderUpdate): Promise<EmittedUpdate[]> {
        const out: EmittedUpdate[] = [];
        try {
          const resource = await project.getProjectResource(u.uri);
          if (resource) {
            // Materialise raw.txt + raw.meta.json and learn the current source hash.
            const { text, hash } = await resource
              .requireAdapter(ResourceTextContentCache)
              .refresh({ force: opts.force });
            const existing = await resource.requireAdapter(WikiPageSummary).get();
            const fresh = !!existing && existing.sourceHash === hash;
            let produced = false;
            // Skip the (costly) summarization when the source is unchanged.
            if (text && (opts.force || !fresh)) {
              log.info("summarizing", { uri: u.uri });
              const { title, baseSummary, sections } = await sectionizeDocument(
                llm,
                cfg,
                system,
                u.uri,
                text,
              );
              const { outline, summary } = await buildOutline(
                llm,
                cfg,
                chapterSystem,
                title,
                baseSummary,
                sections,
              );
              const docSummary: DocumentSummary = {
                uri: u.uri,
                generated: new Date().toISOString(),
                sourceHash: hash,
                title,
                summary,
                sections,
                outline,
              };
              await resource.requireAdapter(WikiPageSummary).write(docSummary);
              produced = true;
            }
            // Emit on a hash-skip too (when a valid summary already exists), so a
            // re-run re-feeds downstream (meta/graph/embedder) without re-summarizing.
            if (produced || fresh) {
              out.push({ signal: SUMMARIZED_SIGNAL, uri: u.uri, stamp: u.stamp });
            }
          }
        } catch (error) {
          // Isolate a bad document (e.g. unparseable PDF): log and skip it rather
          // than blocking the whole pipeline. `handled()` below marks it done so it
          // is not retried until its source changes.
          log.error("summarize failed; skipping document", {
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
