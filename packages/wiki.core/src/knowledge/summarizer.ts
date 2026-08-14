import {
  type BuilderUpdate,
  type EmittedUpdate,
  loggerOf,
  ProjectBuilder,
  type RegisteredBuilder,
} from "@statewalker/workspace.core";
import { CONTENT_SIGNAL } from "../content/index.js";
import {
  BuildTracer,
  buildSessionOf,
  type LlmApi,
  llmOf,
  type WikiLlmConfiguration,
  wikiConfigOf,
} from "../llm/index.js";
import { toBatch } from "../util/batch.js";
import {
  ResourceTextContentCache,
  WikiPageSummary,
  WikiPageSummaryDraft,
} from "./page-adapters.js";
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
import { type DocumentSummary, KNOWLEDGE_SCHEMA_VERSION, type SummaryNode } from "./types.js";

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

/** A summarization checkpoint passed in (to resume) and emitted after each block (to persist). */
export interface SectionizeCheckpoint {
  title: string;
  baseSummary: string;
  sections: SummaryNode[];
  nextStart: number;
}

/**
 * Section a document by walking it in context-window-sized blocks of numbered lines. For a
 * non-final block the last (possibly cut) section is dropped and the next block restarts at its
 * start (the last kept section's end), with that section's summary supplied as rolling context;
 * a lone-section block is kept to guarantee progress. Returns the document title (from the first
 * block), the first block's document-level summary (a base for the document tree), and the
 * assembled flat sections covering the whole document.
 *
 * `opts.resume` continues a prior interrupted walk from its checkpoint (its sections + nextStart).
 * `opts.onBlock` is awaited after EACH block with the current checkpoint, so the caller can persist
 * a `summary.tmp.json` and survive a crash mid-document.
 */
export async function sectionizeDocument(
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  system: string,
  uri: string,
  text: string,
  blockChars: number = SECTION_BLOCK_CHARS,
  opts: {
    resume?: SectionizeCheckpoint;
    onBlock?: (checkpoint: SectionizeCheckpoint) => Promise<void>;
  } = {},
): Promise<{ title: string; baseSummary: string; sections: SummaryNode[] }> {
  const lines = text.split("\n");
  const total = lines.length;
  const sections: SummaryNode[] = opts.resume ? [...opts.resume.sections] : [];
  let title = opts.resume?.title ?? "";
  let baseSummary = opts.resume?.baseSummary ?? "";
  let start = opts.resume?.nextStart ?? 0;
  let previousSection: string | undefined = sections.at(-1)?.summary;

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
      await opts.onBlock?.({ title: title || uri, baseSummary, sections, nextStart: total });
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
    // Checkpoint after the block so an interrupted run resumes here instead of from the top.
    await opts.onBlock?.({ title: title || uri, baseSummary, sections, nextStart: start });
  }

  return { title: title || uri, baseSummary, sections: dedupeKeys(sections) };
}

/** The raw line range [min start .. max end] spanning a set of nodes. */
function spanOf(nodes: SummaryNode[]): { startLine: number; endLine: number } {
  return {
    startLine: Math.min(...nodes.map((n) => n.startLine)),
    endLine: Math.max(...nodes.map((n) => n.endLine)),
  };
}

/**
 * One bottom-up aggregation round: group ordered member nodes into coherent, contiguous TOC
 * nodes whose `children` ARE the grouped members. The LLM only chooses cut points (`memberCount`
 * per chapter); members are sliced left-to-right in document order, so reordering or interleaving
 * is structurally impossible. Counts are clamped to never overrun, and any members left after the
 * last chapter (undershoot) are folded into it — guaranteeing every member lands in exactly one
 * node, in order. Each new node's line range spans its children.
 */
async function aggregateLevel(
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  system: string,
  members: SummaryNode[],
): Promise<SummaryNode[]> {
  const { output } = await llm.generateObject({
    name: "aggregate-chapters",
    description: "Group ordered sections or sub-chapters into coherent, contiguous TOC nodes.",
    model: cfg.modelFor("summarize"),
    system,
    input: { members: members.map((m) => ({ key: m.key, title: m.title, summary: m.summary })) },
    inputSchema: aggregateChaptersInputSchema,
    outputSchema: aggregateChaptersSchema,
  });
  const nodes: SummaryNode[] = [];
  let cursor = 0;
  for (const c of output.chapters) {
    if (cursor >= members.length) break; // overshoot: ignore extra chapters
    const count = Math.min(Math.max(1, c.memberCount), members.length - cursor);
    const children = members.slice(cursor, cursor + count);
    cursor += count;
    nodes.push({ key: slugify(c.title), title: c.title, summary: c.summary, ...spanOf(children) });
    (nodes[nodes.length - 1] as SummaryNode).children = children;
  }
  // Undershoot: fold any remaining members into the last chapter (preserve order + full coverage).
  if (cursor < members.length) {
    const rest = members.slice(cursor);
    const last = nodes[nodes.length - 1];
    if (last?.children) {
      last.children.push(...rest);
      Object.assign(last, spanOf(last.children));
    } else {
      nodes.push({ key: slugify("chapter"), title: "Chapter", summary: "", ...spanOf(rest) });
      (nodes[nodes.length - 1] as SummaryNode).children = rest;
    }
  }
  return dedupeKeys(nodes);
}

/**
 * Build the homogeneous summary tree bottom-up and return its single ROOT node (the document's
 * `title + summary`, its `children` the top-level TOC items, its line range spanning the document).
 * A single-section document IS its root (no synthetic wrapper). A small section set (≤ the chapter
 * fan-out) is wrapped directly under the root — no aggregation LLM call. A larger set is aggregated
 * into TOC nodes, re-aggregated while a level exceeds the fan-out, then wrapped under the root.
 */
export async function buildTree(
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  system: string,
  title: string,
  baseSummary: string,
  leaves: SummaryNode[],
): Promise<SummaryNode> {
  // Degenerate: a single-section document's root IS that section.
  if (leaves.length === 1) return leaves[0] as SummaryNode;

  const fanout = cfg.documentChapterFanout;
  let level = leaves;
  if (leaves.length > fanout) {
    level = await aggregateLevel(llm, cfg, system, leaves);
    while (level.length > fanout) {
      const next = await aggregateLevel(llm, cfg, system, level);
      // Stop if a round made no progress (or collapsed to nothing) to avoid looping.
      if (next.length === 0 || next.length >= level.length) break;
      level = next;
    }
  }
  // Wrap the remaining top-level nodes under a single document root.
  return { key: slugify(title), title, summary: baseSummary, ...spanOf(level), children: level };
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
      const tracer = new BuildTracer(log, SUMMARIZE_BUILDER_ID, buildSessionOf(project));
      const tracedLlm = tracer.wrap(llm);
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
      tracer.totals();
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
            const fresh =
              !!existing &&
              existing.sourceHash === hash &&
              existing.schemaVersion === KNOWLEDGE_SCHEMA_VERSION;
            let produced = false;
            // Skip the (costly) summarization when the source is unchanged.
            if (text && (opts.force || !fresh)) {
              const draftAdapter = resource.requireAdapter(WikiPageSummaryDraft);
              // Resume from a prior interrupted run when its checkpoint matches the current source.
              const draft = await draftAdapter.get();
              const resume =
                draft &&
                draft.sourceHash === hash &&
                draft.schemaVersion === KNOWLEDGE_SCHEMA_VERSION
                  ? draft
                  : undefined;
              log.info(resume ? "resuming summarization" : "summarizing", {
                uri: u.uri,
                ...(resume ? { fromLine: resume.nextStart, sections: resume.sections.length } : {}),
              });
              const { title, baseSummary, sections } = await sectionizeDocument(
                tracedLlm,
                cfg,
                system,
                u.uri,
                text,
                SECTION_BLOCK_CHARS,
                {
                  resume,
                  // Dump the checkpoint after each block so an interruption resumes here.
                  onBlock: (cp) =>
                    draftAdapter.write({
                      sourceHash: hash,
                      schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
                      ...cp,
                    }),
                },
              );
              const root = await buildTree(
                tracedLlm,
                cfg,
                chapterSystem,
                title,
                baseSummary,
                sections,
              );
              const docSummary: DocumentSummary = {
                ...root,
                uri: u.uri,
                generated: new Date().toISOString(),
                sourceHash: hash,
                schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
              };
              await resource.requireAdapter(WikiPageSummary).write(docSummary);
              await draftAdapter.clear(); // checkpoint no longer needed
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
