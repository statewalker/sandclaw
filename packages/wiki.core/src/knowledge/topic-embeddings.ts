import { type FilesApi, tryReadFile } from "@statewalker/webrun-files";
import { ProjectAdapter, ResourceAdapter } from "@statewalker/workspace.core";
import {
  fixedSizeList,
  float32,
  tableFromArrays,
  tableFromIPC,
  tableToIPC,
} from "@uwdata/flechette";
import { tryReadJson, writeJsonAtomic } from "../util/io.js";
import { pageArtifactPath, projectIndexPath } from "./page-paths.js";

function filesApiOf(adapter: { filesApi: FilesApi }): FilesApi {
  return adapter.filesApi;
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

/** Cosine similarity of two equal-length vectors (0 when either is degenerate). */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/** Normalize a vector to exactly `dim` elements (pad with 0 / truncate). */
function fitDim(v: Float32Array | undefined, dim: number): number[] {
  const row = new Array<number>(dim);
  for (let i = 0; i < dim; i++) row[i] = v?.[i] ?? 0;
  return row;
}

/** Encode a `key → vector` map to Arrow IPC bytes (rows in `keys` order). */
function encodeVectors(keys: string[], byKey: Map<string, Float32Array>, dim: number): Uint8Array {
  const table = tableFromArrays(
    { vector: keys.map((k) => fitDim(byKey.get(k), dim)) },
    { types: { vector: fixedSizeList(float32(), dim) } },
  );
  return tableToIPC(table, { format: "stream" }) as Uint8Array;
}

/** Decode an Arrow sidecar into a `key → vector` map, aligned to `keys`. */
function decodeVectors(bytes: Uint8Array, keys: string[]): Map<string, Float32Array> {
  const column = tableFromIPC(bytes).getChild("vector");
  const out = new Map<string, Float32Array>();
  keys.forEach((key, i) => {
    const v = column?.at(i);
    if (v != null) out.set(key, new Float32Array(v as ArrayLike<number>));
  });
  return out;
}

interface VectorStoreMeta {
  model: string;
  dimensionality: number;
  /** Keys in the same row order as the Arrow sidecar vectors. */
  keys: string[];
}

/**
 * A per-page store of one document's topic embeddings (the `name + description`
 * vector of each declared document topic), mirroring {@link
 * import("./page-adapters.js").WikiPageEmbeddings}: JSON metadata
 * (`topic-embeddings.<model>.<dim>.json`) beside an Arrow sidecar, `sourceHash`-gated
 * by the producing builder.
 */
export class WikiPageTopicEmbeddings extends ResourceAdapter {
  private metaPath(model: string, dim: number): string {
    return pageArtifactPath(this.resource, `topic-embeddings.${modelSlug(model)}.${dim}.json`);
  }
  private vectorsPath(model: string, dim: number): string {
    return pageArtifactPath(this.resource, `topic-embeddings.${modelSlug(model)}.${dim}.arrow`);
  }

  getMeta(
    model: string,
    dim: number,
  ): Promise<(VectorStoreMeta & { sourceHash: string }) | undefined> {
    return tryReadJson(filesApiOf(this), this.metaPath(model, dim));
  }

  /** Topic key → embedding vector for this document, or undefined when absent. */
  async getVectors(model: string, dim: number): Promise<Map<string, Float32Array> | undefined> {
    const meta = await this.getMeta(model, dim);
    if (!meta) return undefined;
    const bytes = await tryReadFile(filesApiOf(this), this.vectorsPath(model, dim));
    if (!bytes) return undefined;
    return decodeVectors(bytes, meta.keys);
  }

  /** Write the per-topic vectors + freshness metadata (Arrow first, JSON last). */
  async write(
    model: string,
    dim: number,
    sourceHash: string,
    byKey: Map<string, Float32Array>,
  ): Promise<void> {
    const files = filesApiOf(this);
    const keys = [...byKey.keys()];
    await files.write(this.vectorsPath(model, dim), [encodeVectors(keys, byKey, dim)]);
    await writeJsonAtomic(files, this.metaPath(model, dim), {
      model,
      dimensionality: dim,
      keys,
      sourceHash,
    } satisfies VectorStoreMeta & { sourceHash: string });
  }
}

/**
 * The project-level index-node vector store: each index DAG node's `name +
 * description` vector, keyed by node key. Maintained inline by the node writers
 * (attribution, cleanup, recluster) so a coined node's vector is available as an
 * attribution candidate in the same cycle. A single small store (leaf count ≪
 * section count) read whole for nearest-neighbour candidate retrieval.
 */
export class WikiTopicNodeEmbeddings extends ProjectAdapter {
  private metaPath(model: string, dim: number): string {
    return projectIndexPath(
      this.project.root,
      `topic-node-embeddings.${modelSlug(model)}.${dim}.json`,
    );
  }
  private vectorsPath(model: string, dim: number): string {
    return projectIndexPath(
      this.project.root,
      `topic-node-embeddings.${modelSlug(model)}.${dim}.arrow`,
    );
  }

  /** Node key → vector for the whole index, or an empty map when none stored. */
  async getVectors(model: string, dim: number): Promise<Map<string, Float32Array>> {
    const meta = await tryReadJson<VectorStoreMeta>(filesApiOf(this), this.metaPath(model, dim));
    if (!meta) return new Map();
    const bytes = await tryReadFile(filesApiOf(this), this.vectorsPath(model, dim));
    if (!bytes) return new Map();
    return decodeVectors(bytes, meta.keys);
  }

  /** Replace the whole store with `byKey` (Arrow first, JSON freshness marker last). */
  async write(model: string, dim: number, byKey: Map<string, Float32Array>): Promise<void> {
    const files = filesApiOf(this);
    const keys = [...byKey.keys()];
    await files.write(this.vectorsPath(model, dim), [encodeVectors(keys, byKey, dim)]);
    await writeJsonAtomic(files, this.metaPath(model, dim), {
      model,
      dimensionality: dim,
      keys,
    } satisfies VectorStoreMeta);
  }
}
