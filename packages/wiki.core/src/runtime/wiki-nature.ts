import { joinPath as concatPath } from "@statewalker/webrun-files";
import {
  type BuildStatus,
  DEFAULT_SYSTEM_FOLDER,
  loggerOf,
  type Project,
  ProjectAdapter,
  type ProjectBuildResult,
  type RunProgress,
} from "@statewalker/workspace.core";
import { type WikiConfigData, WikiLlmConfiguration } from "../llm/index.js";
import type { QueryProgress } from "../query/index.js";
import { WikiQuery } from "../query/index.js";
import { tryReadJson } from "../util/io.js";
import { restartWikiFrom, type WikiBuildOptions, wireWikiProject } from "./register-wiki.js";
import { DEFAULT_RENEW_MS, ScanLock } from "./scan-lock.js";

/** Identifies this JS context (tab / CLI process) as a scan-lock holder. One per module load. */
const HOLDER_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Thrown when an embedding-model/dimensionality change would invalidate the built index. */
export class WikiEmbeddingFrozenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikiEmbeddingFrozenError";
  }
}

/** Options of one `WikiScanHandle.run()`. */
export interface WikiScanRunOptions {
  /** Called after each committed batch of tasks (all of one builder). */
  onProgress?: (progress: RunProgress) => void;
}

/** A running scan, exposing the underlying `ProjectBuilder` controls the indexer panel needs. */
export interface WikiScanHandle {
  /**
   * Drive the build to convergence; stops early (between batches) after `stop()`.
   * Resolves with the run's result, or `undefined` when skipped because another writer
   * holds the scan lease. Tasks that keep failing (a bad document) do not reject the run:
   * they are logged, reported in `result.failures`, keep their previous outputs, and are
   * not retried until something they read changes.
   */
  run(opts?: WikiScanRunOptions): Promise<ProjectBuildResult | undefined>;
  /** Current build status: queued tasks per stage and the dead-letter count. */
  status(): Promise<BuildStatus>;
  /** Re-run a stage and everything downstream of it (e.g. `"Embedder"` after an embedding change). */
  restartFrom(stage: string): Promise<void>;
  /** Request the current `run()` to stop after the in-flight batch. */
  stop(): void;
}

/** What the search index was actually built with (recorded in `index/search.json`). */
interface BuiltIndexConfig {
  model: string;
  dimensionality: number;
}

/**
 * The wiki nature of a project, as a façade project adapter. Registered for every
 * project; fronts the wiki's other adapters so a consumer uses one handle:
 * `exists()` (is this project a wiki), `initialize()` (materialize the nature),
 * `scan()` (index, with granular controls), `query()`, and `reconfigure()` (with the
 * embedding-freeze guard). Entry points `load()` the per-project config before the
 * synchronous builders/query run.
 */
export class WikiNature extends ProjectAdapter {
  private get config(): WikiLlmConfiguration {
    return this.project.requireAdapter(WikiLlmConfiguration);
  }

  private searchConfigPath(): string {
    return concatPath(
      this.path.replace(/^\/+|\/+$/g, ""),
      DEFAULT_SYSTEM_FOLDER,
      "index",
      "search.json",
    );
  }

  /** Whether this project carries the wiki nature (its config file exists). */
  exists(): Promise<boolean> {
    return this.config.exists();
  }

  /** Materialize the wiki nature: write the per-project config (`.project/nature.wiki.json`). */
  async initialize(config: WikiConfigData): Promise<void> {
    await this.config.write(config);
  }

  /**
   * Update the per-project config. Language-stage references are freely mutable;
   * the embedding model + dimensionality FREEZE once the index is built — a change
   * that no longer matches `index/search.json` is rejected and requires an explicit
   * re-index (`scan().restartFrom("Embedder")`).
   */
  async reconfigure(next: WikiConfigData): Promise<void> {
    const built = await tryReadJson<BuiltIndexConfig>(this.filesApi, this.searchConfigPath());
    if (
      built &&
      (built.model !== next.embedModel || built.dimensionality !== next.dimensionality)
    ) {
      throw new WikiEmbeddingFrozenError(
        `embedding is frozen: the index was built with "${built.model}"/${built.dimensionality}; ` +
          `re-index with scan().restartFrom("Embedder") before changing it`,
      );
    }
    await this.config.write(next);
  }

  /** Path to this project's best-effort scan lease file. */
  private lockPath(): string {
    return concatPath(
      this.path.replace(/^\/+|\/+$/g, ""),
      DEFAULT_SYSTEM_FOLDER,
      "state",
      "scan.lock",
    );
  }

  /** Wire the wiki builders and return a handle with granular run/status/restart controls. */
  scan(opts: WikiBuildOptions = {}): WikiScanHandle {
    const builder = wireWikiProject(this.project, opts);
    const config = this.config;
    const filesApi = this.filesApi;
    const lockPath = this.lockPath();
    const log = loggerOf(this.project, "WikiScan");
    const abort = new AbortController();
    return {
      run: async (runOpts: WikiScanRunOptions = {}) => {
        await config.load();
        // Best-effort per-project lease: skip when another writer (tab/CLI) is already
        // indexing this project; otherwise hold + heartbeat the lease for the build.
        const lock = new ScanLock(filesApi, lockPath, { holderId: HOLDER_ID });
        if (!(await lock.tryAcquire())) {
          log.debug("scan skipped: lease held by another writer");
          return undefined;
        }
        log.debug("scan started", {
          holderId: HOLDER_ID,
          embeddings: config.hasEmbeddings,
        });
        const renew = setInterval(() => void lock.renew(), DEFAULT_RENEW_MS);
        try {
          // A failed document is not retried on every scan (an LLM step would fail the
          // same way again): it waits until its input changes.
          const result = await builder.run({
            retryFailed: false,
            failOnError: false,
            signal: abort.signal,
            onProgress: runOpts.onProgress,
          });
          // Report the failures when this run parked new ones; failures kept from earlier
          // runs are not re-logged on every (polling) scan.
          if (result.deadLettered > 0) {
            for (const f of result.failures) {
              log.error("build task failed; skipping", {
                builder: f.builder,
                uri: f.key,
                attempts: f.attempts,
                error: f.error,
              });
            }
          } else if (result.failures.length > 0) {
            log.debug("documents still failing", { failed: result.failures.length });
          }
          return result;
        } finally {
          clearInterval(renew);
          await lock.release();
          log.debug("scan finished", { stopped: abort.signal.aborted });
        }
      },
      status: () => builder.status(),
      restartFrom: async (stage) => {
        await config.load();
        await restartWikiFrom(builder, stage);
      },
      stop: () => {
        abort.abort();
      },
    };
  }

  /** Ask the wiki a question (loads config, delegates to `WikiQuery`). An optional
   * `{ paths }` scope restricts retrieval to matching project-relative path prefixes. */
  async query(question: string, opts?: { paths?: string[] }): Promise<QueryProgress> {
    await this.config.load();
    return this.project.requireAdapter(WikiQuery).ask(question, opts);
  }
}

/** Resolve the wiki nature façade from a project. */
export function wikiNatureOf(project: Project): WikiNature {
  return project.requireAdapter(WikiNature);
}
