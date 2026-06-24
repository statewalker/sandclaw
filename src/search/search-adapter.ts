import type { DocumentPath, Index, Indexer, SearchRequest } from "@statewalker/indexer-api";
import {
  type FullTextBlock,
  type FulltextQuery,
  newFullTextAccess,
} from "@statewalker/indexer-fulltext";
import { createFlexSearchIndexer } from "@statewalker/indexer-mem-flexsearch";
import { newVectorAccess, type VectorBlock, type VectorQuery } from "@statewalker/indexer-vector";
import { joinPath as concatPath } from "@statewalker/webrun-files";
import {
  loggerOf,
  type Project,
  ProjectAdapter,
  ProjectBuilder,
  type RegisteredBuilder,
  type Resource,
  SOURCES_REMOVED_SIGNAL,
  type Workspace,
} from "@statewalker/workspace.core";
import { tryReadJson, writeJsonAtomic } from "../util/io.js";
import { FilesIndexerPersistence } from "./files-persistence.js";

const FTS_SUB = "fts";
const VEC_SUB = "vec";
const DEFAULT_SYSTEM_FOLDER = ".project";
const INDEX_NAME = "wiki-search";
/** Persist the index at most once per this interval while indexing. */
const SAVE_THROTTLE_MS = 2000;

const ftsAccess = newFullTextAccess(FTS_SUB);
const vecAccess = newVectorAccess(VEC_SUB);

/** A unit of indexable content: full-text `text` plus an optional precomputed `embedding`. */
export interface SearchBlock {
  blockId: string;
  /** Full-text content (e.g. section summary + raw section text). */
  text: string;
  /** Precomputed section embedding (from the Embedder stage); vector-skipped if absent. */
  embedding?: Float32Array;
}

/**
 * Maps a source resource (and its project-relative uri) to its indexable blocks.
 * The embedding `model` + `dimensionality` are passed in (resolved per-project by
 * the adapter) so the provider can read the matching precomputed-embeddings sidecar.
 */
export type SearchBlocksProvider = (
  resource: Resource,
  uri: string,
  model: string | undefined,
  dimensionality: number | undefined,
) => Promise<SearchBlock[]>;

export interface SearchDeps {
  /** Per-project query embedder (the adapter stays provider/wiki-agnostic). */
  embed: (project: Project, text: string) => Promise<Float32Array>;
  /** Per-project embedding model reference; `undefined` for a text-only (FTS) project. */
  model: (project: Project) => string | undefined;
  /** Per-project embedding dimensionality; `undefined` for a text-only (FTS) project. */
  dimensionality: (project: Project) => number | undefined;
  blocks: SearchBlocksProvider;
}

export interface SearchQuery {
  /** The semantic query — embedded for vector search, and the full-text fallback when
   * `ftsQueries` is omitted. */
  query: string;
  /** Full-text query ladder (strict → relaxed). Blocks matching more entries rank higher.
   * Defaults to `[query]` when omitted. */
  ftsQueries?: string[];
  modes?: ("fts" | "vector")[];
  paths?: string[];
  topK?: number;
}

export interface DocumentMatch {
  uri: string;
  sections: {
    sectionKey: string;
    score: number;
    snippet?: string;
    /** Which sub-indexes surfaced this section in the fused result (its retrieval provenance). */
    modes: ("fts" | "vector")[];
  }[];
}

interface AdapterOptions extends Record<string, unknown>, SearchDeps {}

const DEFAULT_TOP_K = 20;

function toDocumentPath(uri: string): DocumentPath {
  return `/${uri.replace(/^\/+/, "")}`;
}
function fromDocumentPath(path: string): string {
  return path.replace(/^\/+/, "");
}

/**
 * Project-level hybrid (full-text + vector) search over a project's indexable
 * blocks. Wiki-free by contract: it references no wiki types — content (and its
 * precomputed embeddings) is supplied through an injected `SearchBlocksProvider`,
 * so it can be lifted to a standalone `resources-search` package unchanged.
 *
 * The index is persisted under `<project>/<systemFolder>/index/search/` and
 * updated incrementally during indexing (throttled serialization). On search it
 * is loaded into memory and used as-is — no rebuild, no query-time corpus
 * embedding. The model + dimensionality are recorded in `index/search.json`.
 */
export class SearchAdapter extends ProjectAdapter {
  private indexer?: Indexer;
  /** Memoised index init: shared by concurrent callers so the open runs exactly once. */
  private indexReady?: Promise<Index>;
  /** Whether the in-memory index has unsaved changes (drives throttled persistence). */
  private dirty = false;
  /** Timestamp (ms) of the last persistence flush. */
  private lastSaveAt = 0;
  /** The index revision this in-memory copy was loaded at — lets a reader detect that
   * another writer (tab/CLI) advanced the on-disk index and reload it. */
  private loadedRev?: number;

  private get opts(): AdapterOptions {
    return this.options as AdapterOptions;
  }
  /** Embedding model reference, resolved per-project by the injected dep. */
  private get model(): string | undefined {
    return this.opts.model(this.project);
  }
  /** Embedding dimensionality, resolved per-project by the injected dep. */
  private get dimensionality(): number | undefined {
    return this.opts.dimensionality(this.project);
  }
  /** Whether this project carries vectors (an embedding model is configured). When
   * false the index is full-text only and vector queries are skipped. */
  private get hasVectors(): boolean {
    return !!this.model;
  }
  /** Embed a query through the injected per-project embedder. */
  private embedQuery(text: string): Promise<Float32Array> {
    return this.opts.embed(this.project, text);
  }
  private get systemFolder(): string {
    return DEFAULT_SYSTEM_FOLDER;
  }
  private get projectPath(): string {
    return this.path.replace(/^\/+|\/+$/g, "");
  }
  private indexDir(): string {
    return concatPath(this.projectPath, this.systemFolder, "index");
  }
  private configPath(): string {
    return concatPath(this.indexDir(), "search.json");
  }
  private revPath(): string {
    return concatPath(this.indexDir(), "search-rev.json");
  }

  /** Bump the on-disk index revision after a flush so other readers reload; record it
   * as our own loaded revision so we don't pointlessly reload our just-written index. */
  private async bumpRev(): Promise<void> {
    const rev = Date.now();
    await writeJsonAtomic(this.filesApi, this.revPath(), { rev });
    this.loadedRev = rev;
  }

  /**
   * Open the project's persisted index (FTS + vector) into memory — loaded from
   * `index/search/` when present, or created fresh on first use. Records the model
   * + dimensionality in `index/search.json`.
   */
  private ensureIndex(): Promise<Index> {
    // Memoise the in-flight promise so concurrent callers (e.g. parallel per-subject
    // searches) share ONE open — otherwise they race on creating + persisting the index.
    this.indexReady ??= this.openIndex();
    return this.indexReady;
  }

  /**
   * Drop the memoised in-memory index when another writer (a different tab/CLI on the
   * same folder) has advanced the on-disk revision since we loaded — so the next
   * `ensureIndex()` re-opens the current index. No-op for the writer (it bumps its own
   * `loadedRev`) and when nothing has been persisted yet.
   */
  private async reloadIfStale(): Promise<void> {
    const onDisk = (await tryReadJson<{ rev: number }>(this.filesApi, this.revPath()))?.rev;
    if (onDisk === undefined || onDisk === this.loadedRev) return;
    this.indexReady = undefined;
    this.indexer = undefined;
    this.loadedRev = onDisk;
  }

  private async openIndex(): Promise<Index> {
    const persistence = new FilesIndexerPersistence(
      this.filesApi,
      concatPath(this.indexDir(), "search"),
    );
    this.indexer = createFlexSearchIndexer({ persistence });
    const existing = await this.indexer.getIndex(INDEX_NAME);
    if (existing) return existing;
    // A text-only project (no embedding model) gets a full-text sub-index only; the
    // vector sub-index is created solely when an embedding model + dimensionality exist.
    const subIndexes: Record<string, unknown> = {
      [FTS_SUB]: { type: "fulltext", language: "en" },
    };
    if (this.model && this.dimensionality != null) {
      subIndexes[VEC_SUB] = {
        type: "vector",
        dimensionality: this.dimensionality,
        model: this.model,
      };
    }
    const created = await this.indexer.createIndex({
      name: INDEX_NAME,
      subIndexes: subIndexes as Parameters<Indexer["createIndex"]>[0]["subIndexes"],
    });
    // Record model + dimensionality only when the index is first created (the indexing
    // path) — a read-only query that loads an existing index must not write.
    await writeJsonAtomic(this.filesApi, this.configPath(), {
      model: this.model,
      dimensionality: this.dimensionality,
    });
    return created;
  }

  /** Serialize the index to disk, throttled to at most once per `SAVE_THROTTLE_MS`. */
  private async maybePersist(): Promise<void> {
    if (!this.dirty || !this.indexer) return;
    if (Date.now() - this.lastSaveAt < SAVE_THROTTLE_MS) return;
    await this.indexer.flush();
    await this.bumpRev();
    this.dirty = false;
    this.lastSaveAt = Date.now();
  }

  /** Force-serialize any pending index changes — call when an indexing pass completes. */
  async persist(): Promise<void> {
    if (!this.dirty || !this.indexer) return;
    await this.indexer.flush();
    await this.bumpRev();
    this.dirty = false;
    this.lastSaveAt = Date.now();
  }

  /**
   * Re-index one source resource: replace its prior blocks with the current ones.
   * Vectors are precomputed by the Embedder stage (read via the block provider);
   * the FTS content is the section summary + raw text. Persists (throttled).
   */
  async indexPage(resource: Resource, uri: string): Promise<void> {
    const index = await this.ensureIndex();
    const fullTextIndex = ftsAccess.get(index);
    const vectorIndex = this.hasVectors ? vecAccess.get(index) : undefined;

    const path = toDocumentPath(uri);
    await fullTextIndex.deleteDocuments([{ path }]);
    await vectorIndex?.deleteDocuments([{ path }]);

    const blocks = await this.opts.blocks(resource, uri, this.model, this.dimensionality);
    if (blocks.length > 0) {
      const ftsBlocks: FullTextBlock[] = blocks.map((b) => ({
        path,
        blockId: b.blockId,
        content: b.text,
      }));
      await fullTextIndex.addDocument(ftsBlocks);

      if (vectorIndex) {
        const vecBlocks: VectorBlock[] = blocks
          .filter((b) => b.embedding)
          .map((b) => ({ path, blockId: b.blockId, embedding: b.embedding as Float32Array }));
        if (vecBlocks.length > 0) await vectorIndex.addDocument(vecBlocks);
        await vectorIndex.flush();
      }
      await fullTextIndex.flush();
    }
    this.dirty = true;
    await this.maybePersist();
  }

  /** Remove a source's blocks from the index. Persists (throttled). */
  async removePage(uri: string): Promise<void> {
    const index = await this.ensureIndex();
    const path = toDocumentPath(uri);
    await ftsAccess.get(index).deleteDocuments([{ path }]);
    if (this.hasVectors) await vecAccess.get(index).deleteDocuments([{ path }]);
    this.dirty = true;
    await this.maybePersist();
  }

  /** Hybrid (RRF) search, grouped by document. */
  async search(query: SearchQuery): Promise<DocumentMatch[]> {
    await this.reloadIfStale();
    const index = await this.ensureIndex();
    // Drop vector mode when the project has no embeddings (text-only); never embed the
    // query in that case. Guarantee at least full-text so a vector-only request still works.
    let modes = (query.modes ?? ["fts", "vector"]).filter((m) => m !== "vector" || this.hasVectors);
    if (modes.length === 0) modes = ["fts"];
    const request: SearchRequest = { topK: query.topK ?? DEFAULT_TOP_K };
    if (query.paths) request.paths = query.paths.map(toDocumentPath);
    if (modes.includes("fts")) {
      const ftsQueries = query.ftsQueries?.length ? query.ftsQueries : [query.query];
      ftsAccess.setQuery(request, {
        queries: ftsQueries,
      } satisfies FulltextQuery);
    }
    if (modes.includes("vector")) {
      vecAccess.setQuery(request, {
        embeddings: [await this.embedQuery(query.query)],
      } satisfies VectorQuery);
    }

    const byDoc = new Map<string, DocumentMatch>();
    for await (const r of index.search(request)) {
      const uri = fromDocumentPath(r.path);
      const match = byDoc.get(uri) ?? { uri, sections: [] };
      // Per-section provenance: a sub-index's getResult is defined only when it
      // contributed to this fused entry.
      const fts = ftsAccess.getResult(r);
      const modes: ("fts" | "vector")[] = [];
      if (fts) modes.push("fts");
      if (vecAccess.getResult(r)) modes.push("vector");
      match.sections.push({
        sectionKey: r.blockId,
        score: r.score,
        snippet: fts?.snippet,
        modes,
      });
      byDoc.set(uri, match);
    }
    const results = [...byDoc.values()];
    // Authoritative path scoping: the index's `paths` is a best-effort hint (and not
    // honoured by every mode), so enforce the scope here. A path matches a document
    // when it equals the uri (exact) or is an ancestor directory prefix.
    if (query.paths && query.paths.length > 0) {
      const prefixes = query.paths.map((p) => p.replace(/^\/+|\/+$/g, ""));
      return results.filter((m) =>
        prefixes.some((p) => p === "" || m.uri === p || m.uri.startsWith(`${p}/`)),
      );
    }
    return results;
  }
}

/** Register `SearchAdapter` (project-level) with its embedder / block provider. */
export function registerSearch(workspace: Workspace, deps: SearchDeps): () => void {
  return workspace.adaptersRegistry.register("project", SearchAdapter, (project) => {
    const options: AdapterOptions = {
      embed: deps.embed,
      model: deps.model,
      dimensionality: deps.dimensionality,
      blocks: deps.blocks,
    };
    return new SearchAdapter(project, options);
  });
}

/**
 * The index builder: on each `inputSignal` update re-indexes that page's blocks;
 * on `sources:removed`, removes its blocks. Generic — the blocks come from the
 * injected provider on the `SearchAdapter`.
 */
export function searchBuilder(opts: { inputSignal: string }): RegisteredBuilder {
  const { inputSignal } = opts;
  return {
    id: "SearchIndexer",
    inputs: [inputSignal, SOURCES_REMOVED_SIGNAL],
    outputs: [],
    // biome-ignore lint/correctness/useYield: maintains an index; emits no signal
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const search = project.requireAdapter(SearchAdapter);
      const log = loggerOf(project, "SearchIndexer");
      for await (const u of builder.readUpdates({
        signal: inputSignal,
        cell: "SearchIndexer",
      })) {
        try {
          const resource = await project.getProjectResource(u.uri);
          if (resource) {
            log.debug("indexing page", { uri: u.uri });
            await search.indexPage(resource, u.uri);
          }
        } catch (error) {
          log.error("indexing failed; skipping document", {
            uri: u.uri,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        await u.handled();
        if (!(await builder.yieldControl())) return false;
      }
      for await (const u of builder.readUpdates({
        signal: SOURCES_REMOVED_SIGNAL,
        cell: "SearchIndexer",
      })) {
        try {
          log.debug("removing page", { uri: u.uri });
          await search.removePage(u.uri);
        } catch (error) {
          log.error("removal failed; skipping document", {
            uri: u.uri,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        await u.handled();
        if (!(await builder.yieldControl())) return false;
      }
      // Drained: force the final serialization the throttle may have skipped.
      await search.persist();
      return true;
    },
  };
}
