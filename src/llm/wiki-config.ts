import { joinPath as concatPath } from "@statewalker/webrun-files";
import { DEFAULT_SYSTEM_FOLDER, type Project, ProjectAdapter } from "@statewalker/workspace.core";
import { tryReadJson, writeJsonAtomic } from "../util/io.js";

/**
 * The model *references* the wiki's indexing/search stages use. Each value is a
 * model-reference URI (`connectionId:modelId`) resolved to a runtime model by the
 * generic `LlmProjectAdapter`'s provider. Every stage falls back to `default` when
 * its specific reference is unset (see {@link WikiLlmConfiguration.modelFor}).
 */
export interface StageModelNames {
  default: string;
  summarize?: string;
  meta?: string;
  graph?: string;
  reorganize?: string;
  query?: string;
  queryFast?: string;
  queryStrong?: string;
}

/** A wiki text-generation stage (any `StageModelNames` key except `default`). */
export type ModelStage = keyof Omit<StageModelNames, "default">;

/** The per-project wiki configuration, as persisted in `.project/nature.wiki.json`. */
export interface WikiConfigData {
  /** Stage → model-reference URI for text-generation stages. */
  models: StageModelNames;
  /** Embedding model reference URI (also part of the per-doc embeddings filename + index
   * config). Omitted for a **text-only** wiki: no vectors are produced and search/query
   * fall back to full-text only. */
  embedModel?: string;
  /** Embedding dimensionality (frozen once the index is built). Omitted with `embedModel`. */
  dimensionality?: number;
  /** Steers stage prompts (summariser detail, what counts as on-corpus, …). */
  corpusPurpose?: string;
  /** Topic-index category fan-out `B`: a category with more direct children is split. */
  topicFanout?: number;
  /** Topic-index leaf cap `R`: an index topic with more references is refined. */
  topicLeafCap?: number;
  /** Document-outline chapter fan-out: a level with more chapters is re-aggregated into super-chapters. */
  documentChapterFanout?: number;
}

/** Default category fan-out `B` — a category over this many children is split. */
export const DEFAULT_TOPIC_FANOUT = 10;
/** Default index-topic reference cap `R` — a leaf over this many refs is refined. */
export const DEFAULT_TOPIC_LEAF_CAP = 25;
/** Default document-outline chapter fan-out — a level over this many chapters is re-aggregated. */
export const DEFAULT_DOCUMENT_CHAPTER_FANOUT = 8;

/** The wiki nature's marker / config file, under the project system folder. */
export const WIKI_NATURE_FILE = "nature.wiki.json";

/**
 * Wiki-specific model configuration, exposed as a per-project adapter: which model
 * each indexing/search stage uses (text stages + the embedding model and
 * dimensionality) plus the `corpusPurpose` knob. The config is **per project**,
 * read from `.project/nature.wiki.json`. Following the `AiConfig` pattern, the file
 * is read once by {@link load} into an in-memory cache, and the sync getters
 * (`modelFor`/`embedModel`/`dimensionality`) read that cache — so callers MUST
 * `load()` (done by `WikiNature`'s entry points) before the synchronous builders run.
 */
export class WikiLlmConfiguration extends ProjectAdapter {
  private cfg?: WikiConfigData;

  /** Config injected at registration (`options.config`) — seeds the in-memory cache
   * without a file read. Lets a caller supply defaults directly (and keeps tests
   * file-free); when absent, config comes from `.project/nature.wiki.json`. */
  private get injected(): WikiConfigData | undefined {
    return this.options.config as WikiConfigData | undefined;
  }

  private configPath(): string {
    return concatPath(this.path.replace(/^\/+|\/+$/g, ""), DEFAULT_SYSTEM_FOLDER, WIKI_NATURE_FILE);
  }

  /** Whether the wiki nature is materialized (config present on disk or already loaded). */
  async exists(): Promise<boolean> {
    if (this.cfg ?? this.injected) return true;
    return (await tryReadJson<WikiConfigData>(this.filesApi, this.configPath())) != null;
  }

  /** Read the per-project config into memory (idempotent). Throws when absent. */
  async load(): Promise<this> {
    if (this.cfg) return this;
    const data =
      this.injected ?? (await tryReadJson<WikiConfigData>(this.filesApi, this.configPath()));
    if (!data) {
      throw new Error(`wiki nature not initialized: ${this.configPath()} is absent`);
    }
    this.cfg = data;
    return this;
  }

  /** Write the config file and cache it in memory (materializes the wiki nature). */
  async write(cfg: WikiConfigData): Promise<void> {
    await writeJsonAtomic(this.filesApi, this.configPath(), cfg);
    this.cfg = cfg;
  }

  /** The loaded (or injected) config, or throw if neither is available. */
  get data(): WikiConfigData {
    const cfg = this.cfg ?? this.injected;
    if (!cfg) throw new Error("WikiLlmConfiguration not loaded; call load() first");
    return cfg;
  }

  /** Model reference for a text-generation stage, falling back to `default`. */
  modelFor(stage: ModelStage): string {
    return this.data.models[stage] ?? this.data.models.default;
  }

  get embedModel(): string | undefined {
    return this.data.embedModel;
  }

  get dimensionality(): number | undefined {
    return this.data.dimensionality;
  }

  /** Whether this wiki indexes with embeddings (vector search) or is full-text only. */
  get hasEmbeddings(): boolean {
    return !!this.data.embedModel;
  }

  get corpusPurpose(): string | undefined {
    return this.data.corpusPurpose;
  }

  /** Category fan-out `B` (split threshold), falling back to the default. */
  get topicFanout(): number {
    return this.data.topicFanout ?? DEFAULT_TOPIC_FANOUT;
  }

  /** Index-topic reference cap `R` (refine threshold), falling back to the default. */
  get topicLeafCap(): number {
    return this.data.topicLeafCap ?? DEFAULT_TOPIC_LEAF_CAP;
  }

  /** Document-outline chapter fan-out (re-aggregate threshold), falling back to the default. */
  get documentChapterFanout(): number {
    return this.data.documentChapterFanout ?? DEFAULT_DOCUMENT_CHAPTER_FANOUT;
  }
}

/** Resolve the wiki model configuration from a project (mirrors `loggerOf`). */
export function wikiConfigOf(project: Project): WikiLlmConfiguration {
  return project.requireAdapter(WikiLlmConfiguration);
}
