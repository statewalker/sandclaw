import type { ExtractorRegistry } from "@statewalker/content-extractors";
import {
  applyNature,
  type Nature,
  type Project,
  ProjectBuilder,
  type RegisteredBuilder,
  type Resource,
  type Workspace,
} from "@statewalker/workspace.core";
import { contentBuilder, registerContentExtraction } from "../content/index.js";
import {
  docTopicEmbedderBuilder,
  EMBEDDED_SIGNAL,
  embedderBuilder,
  metaBuilder,
  pruneBuilder,
  registerKnowledgeAdapters,
  reorganizeBuilder,
  summarizeBuilder,
  summaryLeaves,
  tableExtractorBuilder,
  topicCleanupBuilder,
} from "../knowledge/index.js";
import {
  ResourceTextContentCache,
  WikiPageEmbeddings,
  WikiPageSummary,
} from "../knowledge/page-adapters.js";
import {
  type LlmApi,
  LlmProjectAdapter,
  type LlmProvider,
  llmOf,
  WikiBuildSession,
  WikiLlmConfiguration,
  wikiConfigOf,
} from "../llm/index.js";
import { registerQuery } from "../query/index.js";
import { registerSnapshots } from "../query/snapshots.js";
import {
  registerSearch,
  type SearchBlock,
  type SearchBlocksProvider,
  searchBuilder,
} from "../search/index.js";
import { buildIndexIgnore } from "./index-ignore.js";
import { WikiNature } from "./wiki-nature.js";

export interface WikiDeps {
  /** Provider for the generic `LlmProjectAdapter` (production) — typically the
   * AiConfig provider registry. Omit when `llm` is given. */
  provider?: LlmProvider;
  /** Pre-built LLM adapter (test stub). Takes precedence over `provider`. */
  llm?: LlmApi;
  extractors?: ExtractorRegistry;
  clock?: () => string;
}

/** Per-run build options (distinct from the stable model configuration). */
export interface WikiBuildOptions {
  /** Re-run every build stage even when the source hash is unchanged. */
  force?: boolean;
}

/**
 * Wiki search blocks for the given embedding model/dimensionality: full-text over
 * each section's title + summary + raw text (the section's line range), with the
 * section's precomputed embedding (read from the Embedder's Arrow sidecar
 * `embeddings.<model>.<dim>.arrow`) as the vector.
 */
export const wikiSearchBlocks: SearchBlocksProvider = async (
  resource: Resource,
  _uri: string,
  model: string | undefined,
  dimensionality: number | undefined,
) => {
  const summary = await resource.getAdapter(WikiPageSummary)?.get();
  if (!summary) return [];
  const raw = await resource.requireAdapter(ResourceTextContentCache).getTextContent();
  const lines = raw.split("\n");
  // Text-only project: no embedding model → no precomputed vectors to attach.
  const vectors =
    model && dimensionality != null
      ? await resource.getAdapter(WikiPageEmbeddings)?.getVectors(model, dimensionality)
      : undefined;
  return summaryLeaves(summary).map((s): SearchBlock => {
    const rawBlock = lines.slice(s.startLine, s.endLine + 1).join("\n");
    return {
      blockId: s.key,
      text: `${s.title}\n${s.summary}\n${rawBlock}`,
      embedding: vectors?.get(s.key),
    };
  });
};

/** Build the generic LLM adapter from deps: a supplied stub, else a provider-backed one. */
function resolveLlm(deps: WikiDeps): LlmApi {
  if (deps.llm) return deps.llm;
  if (!deps.provider) throw new Error("registerWiki: either `provider` or `llm` is required");
  return new LlmProjectAdapter({ provider: deps.provider });
}

/**
 * The wiki nature's project-adapter pack: the generic `LlmProjectAdapter` (from the
 * injected stub/provider) plus the wiki-specific per-project adapters that self-host
 * on a `Project` (`WikiLlmConfiguration`, the `WikiNature` façade, build-session
 * telemetry). Its `builders()` are the wiki's incremental index pipeline. Applied via
 * `applyNature(workspace, wikiNature(deps))`; the closure/multi-level registrations
 * (content extraction, hybrid search, snapshots) stay explicit in `registerWiki`.
 */
export function wikiNature(deps: WikiDeps, opts: WikiBuildOptions = {}): Nature {
  const llm = resolveLlm(deps);
  return {
    adapters: () => [
      // Model access (generic), from the injected stub/provider.
      { level: "project", type: LlmProjectAdapter, factory: () => llm },
      // Model configuration (wiki-specific, per-project): reads `.project/nature.wiki.json`
      // via its `load()`, driven by the `WikiNature` façade's entry points.
      {
        level: "project",
        type: WikiLlmConfiguration,
        factory: (project) => new WikiLlmConfiguration(project),
      },
      { level: "project", type: WikiNature, factory: (project) => new WikiNature(project) },
      // Per-project build-session telemetry (LLM model/token/price + time stats, persisted
      // under `.project/builds/`, resumable across interrupted builds).
      {
        level: "project",
        type: WikiBuildSession,
        factory: (project) => new WikiBuildSession(project),
      },
    ],
    builders: () => createWikiBuilders(opts),
  };
}

/**
 * One-call setup: apply the wiki nature (project-adapter pack + builder provider) plus
 * the remaining closure/multi-level registrations — content extraction, per-page +
 * global knowledge adapters, hybrid search, query, snapshots. Providers/config are
 * injected here — adapters read no environment. Use `wireWikiProject` to attach the
 * builders to a project before a run.
 */
export function registerWiki(workspace: Workspace, deps: WikiDeps): void {
  // Core resource adapters (ContentRead/Write/Text), Project, and ProjectBuilder
  // self-host on the workspace model — no registration needed.
  applyNature(workspace, wikiNature(deps));
  // Wiki adapters.
  registerContentExtraction(workspace, { registry: deps.extractors });
  registerKnowledgeAdapters();
  // Search stays wiki-free: the per-project embedding model + dimensionality + query
  // embedder are resolved here (where the wiki adapters are known) and injected.
  registerSearch(workspace, {
    embed: (project, text) => {
      // Only reached for vector search, which the adapter disables when no model exists.
      const model = wikiConfigOf(project).embedModel;
      if (!model) throw new Error("wiki search: no embedding model configured (text-only project)");
      return llmOf(project).embed(text, model);
    },
    model: (project) => wikiConfigOf(project).embedModel,
    dimensionality: (project) => wikiConfigOf(project).dimensionality,
    blocks: wikiSearchBlocks,
  });
  registerQuery(workspace);
  registerSnapshots(workspace, { clock: deps.clock });
}

/** The wiki's builder pipeline, in registration order. Builders read their models
 * from the project adapters; only the per-run `force` flag is threaded here. */
export function createWikiBuilders(opts: WikiBuildOptions = {}): RegisteredBuilder[] {
  const { force } = opts;
  return [
    contentBuilder(),
    summarizeBuilder({ force }),
    metaBuilder({ force }),
    // Deferred structured-table extraction — parallel to meta/embedder, off the
    // search critical path; runs only on sections flagged as containing tables.
    tableExtractorBuilder({ force }),
    embedderBuilder({ force }),
    // Embed each document's topics, then attribute them onto the topic DAG, then
    // automatically clean up scattered near-duplicate index topics.
    docTopicEmbedderBuilder({ force }),
    reorganizeBuilder(),
    topicCleanupBuilder(),
    pruneBuilder(),
    searchBuilder({ inputSignal: EMBEDDED_SIGNAL }),
  ];
}

/** Changed sources indexed per scan batch. Each batch traverses the whole pipeline
 * — so `topics.json`, `outliers.json`, and the search index are dumped — before the
 * next batch is scanned, making already-indexed documents searchable mid-build. */
const WIKI_SCAN_BATCH_SIZE = 16;

/** Attach the wiki builders to a project's `ProjectBuilder` and return it. The wiki's
 * `.indexignore` matcher is injected into the generic source scan (recompiled per run).
 * Source scanning is batched so the global indexes are persisted incrementally. */
export function wireWikiProject(project: Project, opts: WikiBuildOptions = {}): ProjectBuilder {
  const builder = project.requireAdapter(ProjectBuilder);
  builder.configureYield({ scanBatchSize: WIKI_SCAN_BATCH_SIZE });
  builder.configureSourceIgnore(() => buildIndexIgnore(project.workspace.files, project.path));
  // The per-project builder step: attach the nature's builders (per-call `opts` such as
  // `force` are threaded here, so builders are built per wiring rather than shared).
  applyNature(project, { builders: () => createWikiBuilders(opts) });
  return builder;
}
