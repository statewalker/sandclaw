import type { FileInfo, FileStats } from "@statewalker/webrun-files";

/**
 * Slot value contributed to `files:mime-renderers`. The `files:visualize`
 * default handler resolves a contribution by `mimeTypePattern` (a glob
 * with `*` as a single wildcard segment) and creates a panel that
 * looks up `viewKey` in `ViewRegistry`. Slot pattern C.
 */
export interface MimeRenderer {
  /**
   * Glob-style pattern matched against the resolved MIME type.
   * Examples: `"text/markdown"`, `"image/*"`, `"application/json"`.
   */
  mimeTypePattern: string;
  /** ViewRegistry key resolved by the rendering panel. */
  viewKey: string;
  /** Sort order; lower numbers win when multiple match. Default: 100. */
  order?: number;
}

/**
 * Slot value contributed to `files:mime-icons`. Resolved by the
 * file explorer / breadcrumbs UI to render an icon for a file.
 */
export interface MimeIcon {
  mimeTypePattern: string;
  /** Lucide icon name or arbitrary registry key (consumer-defined). */
  icon: string;
  order?: number;
}

/**
 * Slot value contributed to `files:editor-factories`. Wave 5.1
 * declares the slot for forward-compatibility; the full editor
 * substrate lands in a follow-up wave.
 */
export interface EditorFactory {
  mimeTypePattern: string;
  /** ViewRegistry key for the editing surface. */
  viewKey: string;
  order?: number;
}

/**
 * Slot value contributed to `files:indexers`. Background indexers
 * (full-text, embeddings, etc.) plug into this slot. Wave 5.1
 * declares only — the runner that orchestrates indexers lands
 * with the search wave.
 */
export interface Indexer {
  /** Stable id used for diff'ing across runs. */
  id: string;
  /** Indexer entry point. The bus passes the workspace's
   * primary `FilesApi` so the indexer can scan / read files. */
  run(opts: { signal?: AbortSignal }): Promise<void>;
}

/**
 * Result returned by `runLoadDirectory`. Mirrors a thin slice of
 * `FileInfo` plus optional MIME metadata that future enrichment
 * passes can attach.
 */
export interface DirectoryEntry extends FileInfo {
  mimeType?: string;
}

/**
 * Result returned by `runLoadFile`. Carries the bytes plus
 * derived metadata so consumers don't re-stat after read.
 */
export interface LoadedFile {
  path: string;
  bytes: Uint8Array;
  stats?: FileStats;
  mimeType?: string;
}
