import { type FilesApi, tryReadFile } from "@statewalker/webrun-files";
import { ResourceAdapter } from "@statewalker/workspace.core";
import {
  fixedSizeList,
  float32,
  tableFromArrays,
  tableFromIPC,
  tableToIPC,
} from "@uwdata/flechette";
import { ContentAdapter } from "../content/index.js";
import { hashStream } from "../util/hash.js";
import { tryReadJson, tryReadText, writeJsonAtomic, writeTextAtomic } from "../util/io.js";
import { pageArtifactPath } from "./page-paths.js";
import {
  type DocumentEmbeddings,
  type DocumentMeta,
  type DocumentSummary,
  type DocumentTables,
  findSummaryNode,
  type RawMeta,
  type SummaryDraft,
  type SummaryNode,
  summaryLeaves,
  summaryPath,
} from "./types.js";

function filesApiOf(adapter: { filesApi: FilesApi }): FilesApi {
  return adapter.filesApi;
}

/**
 * Caches a source resource's extracted raw text under the project system folder,
 * extracting via `ContentAdapter` on first access. The canonical raw-text accessor
 * for downstream builders (summarizer, etc.).
 */
export class ResourceTextContentCache extends ResourceAdapter {
  private rawPath(): string {
    return pageArtifactPath(this.resource, "raw.txt");
  }
  private metaPath(): string {
    return pageArtifactPath(this.resource, "raw.meta.json");
  }

  /** Metadata about the cached raw text — including the source hash. */
  getRawMeta(): Promise<RawMeta | undefined> {
    return tryReadJson<RawMeta>(filesApiOf(this), this.metaPath());
  }

  /** SHA-256 (hex) of the current source bytes, plus the byte count. */
  private sourceHash(): Promise<{ hash: string; bytes: number }> {
    return hashStream(filesApiOf(this).read(this.resource.path));
  }

  /** Extracted plain text — from cache, or extracted-and-cached on first call. */
  async getTextContent(): Promise<string> {
    const cached = await tryReadText(filesApiOf(this), this.rawPath());
    if (cached !== undefined) return cached;
    return (await this.refresh()).text;
  }

  /**
   * Ensure `raw.txt` + `raw.meta.json` reflect the current source. If the source
   * hash is unchanged (and the cache is present) the extraction is skipped and the
   * cached text returned; otherwise the source is re-extracted and both artifacts
   * rewritten. `force` always re-extracts. `changed` reports whether the source
   * (by hash) differs from the last cached one.
   */
  async refresh(opts: { force?: boolean } = {}): Promise<{
    text: string;
    hash: string;
    changed: boolean;
  }> {
    const files = filesApiOf(this);
    const { hash, bytes } = await this.sourceHash();
    const prev = await this.getRawMeta();
    if (!opts.force && prev?.hash === hash) {
      const cached = await tryReadText(files, this.rawPath());
      if (cached !== undefined) return { text: cached, hash, changed: false };
    }
    const content = this.resource.getAdapter(ContentAdapter);
    const text = (await content?.readContent()) ?? "";
    await writeTextAtomic(files, this.rawPath(), text);
    await writeJsonAtomic(files, this.metaPath(), {
      hash,
      bytes,
      generated: new Date().toISOString(),
    } satisfies RawMeta);
    return { text, hash, changed: prev?.hash !== hash };
  }
}

/** Reads/writes a source resource's L2 `DocumentSummary` (`summary.json`). */
export class WikiPageSummary extends ResourceAdapter {
  private artifactPath(): string {
    return pageArtifactPath(this.resource, "summary.json");
  }

  async get(): Promise<DocumentSummary | undefined> {
    return tryReadJson<DocumentSummary>(filesApiOf(this), this.artifactPath());
  }

  /** The in-document-order leaf sections — the addressable / citable unit. */
  async leaves(): Promise<SummaryNode[]> {
    const summary = await this.get();
    return summary ? summaryLeaves(summary) : [];
  }

  /** Any node (leaf, TOC item, or root) by its key. */
  async findByKey(key: string): Promise<SummaryNode | undefined> {
    const summary = await this.get();
    return summary ? findSummaryNode(summary, key) : undefined;
  }

  /** Ancestor path root→…→node (inclusive) for a node key, or `[]` when not found. */
  async pathToRoot(key: string): Promise<SummaryNode[]> {
    const summary = await this.get();
    return summary ? summaryPath(summary, key) : [];
  }

  async write(summary: DocumentSummary): Promise<void> {
    await writeJsonAtomic(filesApiOf(this), this.artifactPath(), summary);
  }
}

/** Reads/writes/clears a source resource's summarization checkpoint (`summary.tmp.json`). */
export class WikiPageSummaryDraft extends ResourceAdapter {
  private artifactPath(): string {
    return pageArtifactPath(this.resource, "summary.tmp.json");
  }

  async get(): Promise<SummaryDraft | undefined> {
    return tryReadJson<SummaryDraft>(filesApiOf(this), this.artifactPath());
  }

  async write(draft: SummaryDraft): Promise<void> {
    await writeJsonAtomic(filesApiOf(this), this.artifactPath(), draft);
  }

  /** Remove the checkpoint once the final `summary.json` is written (best-effort). */
  async clear(): Promise<void> {
    try {
      await filesApiOf(this).remove(this.artifactPath());
    } catch {
      // No checkpoint to remove (single-block document, or already cleared) — fine.
    }
  }
}

/** Reads/writes a source resource's deferred-extracted structured tables (`tables.json`). */
export class WikiPageTables extends ResourceAdapter {
  private artifactPath(): string {
    return pageArtifactPath(this.resource, "tables.json");
  }

  /** All of a page's tables, keyed by the leaf section key they belong to. */
  async get(): Promise<DocumentTables | undefined> {
    return tryReadJson<DocumentTables>(filesApiOf(this), this.artifactPath());
  }

  /** A single section's tables (empty when none). */
  async forSection(sectionKey: string): Promise<DocumentTables[string]> {
    return (await this.get())?.[sectionKey] ?? [];
  }

  async write(tables: DocumentTables): Promise<void> {
    await writeJsonAtomic(filesApiOf(this), this.artifactPath(), tables);
  }
}

/** Reads/writes a source resource's `DocumentMeta` (`meta.json`). */
export class WikiPageMeta extends ResourceAdapter {
  private artifactPath(): string {
    return pageArtifactPath(this.resource, "meta.json");
  }

  async get(): Promise<DocumentMeta | undefined> {
    return tryReadJson<DocumentMeta>(filesApiOf(this), this.artifactPath());
  }

  async write(meta: DocumentMeta): Promise<void> {
    await writeJsonAtomic(filesApiOf(this), this.artifactPath(), meta);
  }
}

/** Filesystem-safe slug for an embedding model id (used in the artifact name). */
function modelSlug(model: string): string {
  return (
    model
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "model"
  );
}

/**
 * Reads/writes a source resource's per-section embeddings. Metadata (uri, source
 * hash, model, dimensionality, ordered section keys) lives in
 * `embeddings.<model>.<dim>.json`; the dense vectors live in the Arrow sidecar
 * `embeddings.<model>.<dim>.arrow` as a `FixedSizeList<Float32>[dim]` column,
 * row `i` matching `meta.sections[i]`. The model + dimensionality are part of the
 * filenames so different models/dimensions coexist without collision.
 */
export class WikiPageEmbeddings extends ResourceAdapter {
  private metaPath(model: string, dimensionality: number): string {
    return pageArtifactPath(this.resource, `embeddings.${modelSlug(model)}.${dimensionality}.json`);
  }
  private vectorsPath(model: string, dimensionality: number): string {
    return pageArtifactPath(
      this.resource,
      `embeddings.${modelSlug(model)}.${dimensionality}.arrow`,
    );
  }

  /** Embeddings metadata (JSON) — cheap; used for freshness checks. */
  getMeta(model: string, dimensionality: number): Promise<DocumentEmbeddings | undefined> {
    return tryReadJson<DocumentEmbeddings>(filesApiOf(this), this.metaPath(model, dimensionality));
  }

  /** Section key → embedding vector, decoded from the Arrow sidecar. */
  async getVectors(
    model: string,
    dimensionality: number,
  ): Promise<Map<string, Float32Array> | undefined> {
    const meta = await this.getMeta(model, dimensionality);
    if (!meta) return undefined;
    const bytes = await tryReadFile(filesApiOf(this), this.vectorsPath(model, dimensionality));
    if (!bytes) return undefined;
    const column = tableFromIPC(bytes).getChild("vector");
    const vectors = new Map<string, Float32Array>();
    meta.sections.forEach((key, i) => {
      const v = column?.at(i);
      if (v != null) vectors.set(key, new Float32Array(v as ArrayLike<number>));
    });
    return vectors;
  }

  /**
   * Write the metadata (JSON) + dense vectors (Arrow). `vectors[i]` is the
   * embedding for `meta.sections[i]`. The Arrow sidecar is written first and the
   * JSON metadata (the freshness marker) last, so a crash never leaves metadata
   * pointing at missing vectors.
   */
  async write(meta: DocumentEmbeddings, vectors: Float32Array[]): Promise<void> {
    const files = filesApiOf(this);
    const table = tableFromArrays(
      { vector: vectors.map((v) => Array.from(v)) },
      { types: { vector: fixedSizeList(float32(), meta.dimensionality) } },
    );
    const bytes = tableToIPC(table, { format: "stream" }) as Uint8Array;
    // The Arrow vectors are written first; the JSON metadata (the freshness
    // marker, read by getMeta) is written last so a crash never leaves metadata
    // pointing at a missing/partial vectors file.
    await files.write(this.vectorsPath(meta.model, meta.dimensionality), [bytes]);
    await writeJsonAtomic(files, this.metaPath(meta.model, meta.dimensionality), meta);
  }
}
