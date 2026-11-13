import {
  type ContentExtractor,
  createDefaultRegistry,
  type ExtractorRegistry,
} from "@statewalker/content-extractors";
import {
  loggerOf,
  type RegisteredBuilder,
  type Resource,
  ResourceAdapter,
  SOURCES_COLLECTION,
  type Workspace,
} from "@statewalker/workspace.core";

/** Collection with one row per resource whose text content is available (keyed by uri). */
export const CONTENT_SIGNAL = "content";

/** Cell id of the content-extraction builder. */
export const CONTENT_BUILDER_ID = "Extractor";

export interface ContentExtractionOptions {
  /** Maps a resource path to a text extractor. Defaults to `createDefaultRegistry()`. */
  registry?: ExtractorRegistry;
  /** Extractor for paths the registry doesn't match. */
  fallback?: ContentExtractor;
}

interface AdapterOptions extends Record<string, unknown> {
  registry: ExtractorRegistry;
  fallback?: ContentExtractor;
}

/**
 * Reads a resource's text content via a mime-aware extractor registry. Present
 * (via `getAdapter`) only for resources whose path the registry (or fallback)
 * can extract; otherwise `getAdapter(ContentAdapter)` returns `null`.
 *
 * Wiki-free by contract: this adapter references no wiki types — it operates on a
 * `Resource` and produces text, so it can be lifted to a standalone
 * `resources-content` package unchanged.
 */
export class ContentAdapter extends ResourceAdapter {
  private get opts(): AdapterOptions {
    return this.options as AdapterOptions;
  }

  private extractor(): ContentExtractor | undefined {
    return this.opts.registry.get(this.resource.url) ?? this.opts.fallback;
  }

  /** Extracted plain text, or `undefined` if nothing could be extracted. */
  async readContent(): Promise<string | undefined> {
    const extractor = this.extractor();
    if (!extractor) return undefined;
    const result = await extractor(this.filesApi.read(this.resource.path));
    if (result === null || result === undefined) return undefined;
    const text = typeof result === "string" ? result : String(result);
    return text.length === 0 ? undefined : text;
  }
}

/**
 * Register `ContentAdapter` on the repository so it is present only for
 * extractable resources. Returns an unregister function.
 */
export function registerContentExtraction(
  workspace: Workspace,
  opts: ContentExtractionOptions = {},
): () => void {
  const registry = opts.registry ?? createDefaultRegistry();
  const fallback = opts.fallback;
  return workspace.adaptersRegistry.register("resource", ContentAdapter, (resource: Resource) => {
    const extractor = registry.get(resource.url) ?? fallback;
    return extractor ? new ContentAdapter(resource, { registry, fallback }) : null;
  });
}

/**
 * The content-extraction builder: a map builder over `sources` (one task per project
 * file) that emits a `content` row for each extractable resource — its value is the
 * source row's fingerprint (`{ mtime, size }`), so a changed file re-feeds the
 * summarizer while an untouched one is cut off. A resource with no registered
 * extractor emits nothing (not a failure). A detection error is logged and rethrown:
 * the task dead-letters and its previous output is kept.
 */
export function contentBuilder(): RegisteredBuilder {
  return {
    id: CONTENT_BUILDER_ID,
    inputs: [SOURCES_COLLECTION],
    outputs: [CONTENT_SIGNAL],
    async run(ctx, project) {
      const log = loggerOf(project, CONTENT_BUILDER_ID);
      const uri = ctx.key;
      const source = await ctx.get(SOURCES_COLLECTION, uri);
      if (source === undefined) return;
      try {
        const resource = await project.getProjectResource(uri);
        if (resource?.getAdapter(ContentAdapter)) {
          log.debug("extracting content", { uri });
          ctx.emit(CONTENT_SIGNAL, uri, source);
        }
      } catch (error) {
        log.error("content detection failed", {
          uri,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}
