// ── Raw text cache metadata (ContentCache) ─────────────────────────────────

/**
 * Metadata about a page's cached raw text (`raw.txt`). Its `hash` is the SHA-256
 * of the original source bytes; the build stages compare it against the
 * `sourceHash` they recorded to skip re-running on unchanged sources.
 */
export interface RawMeta {
  /** SHA-256 (hex) of the original source bytes. */
  hash: string;
  /** Source size in bytes. */
  bytes: number;
  generated: string;
}

// ── L2 narrative summary (Summarizer) ──────────────────────────────────────

/**
 * Bumped whenever the summary-node shape or the prompt that fills it changes.
 * Stored on the summary/meta/embeddings artifacts and checked alongside
 * `sourceHash` so a schema change regenerates artifacts even when the source
 * bytes are unchanged. v1 = legacy RDF-graph era; v2 = merged summary + details +
 * tables layer; v3 = homogeneous SummaryNode tree (no details; tables deferred).
 */
export const KNOWLEDGE_SCHEMA_VERSION = 3;

/**
 * A structured table of repetitive facts within a section (a source table, or an
 * enumeration of the same attributes across several objects). Cells are strings.
 * Extracted by the deferred table-extraction stage and persisted in `tables.json`
 * keyed by leaf section key — never inline on a {@link SummaryNode}.
 */
export interface DetailTable {
  caption: string;
  columns: string[];
  rows: string[][];
}

/** A page's deferred-extracted tables, keyed by the leaf section key they belong to. */
export type DocumentTables = Record<string, DetailTable[]>;

/**
 * One node of the document summary tree. Every node — leaf section, intermediate
 * TOC item, and the document root — shares this shape. Leaves (no `children`) are
 * the flat, addressable, citable section unit; internal nodes group their children
 * and are NEVER citation targets. `startLine`/`endLine` span the node's descendants.
 * The presence flags are leaf-only and drive the deferred table-extraction stage.
 */
export interface SummaryNode {
  /** Kebab-case slug; stable across re-ingests when the node is semantically the same. */
  key: string;
  title: string;
  /** Thematic abstract; on a leaf it states the section's main facts and flags tables/images. */
  summary: string;
  /** 0-indexed inclusive raw line range (spans all descendant leaves for an internal node). */
  startLine: number;
  endLine: number;
  /** Child nodes (TOC items or leaf sections). Absent/empty on a leaf. */
  children?: SummaryNode[];
  /** Leaf-only: the section's raw content holds table-like data (drives deferred extraction). */
  hasTables?: boolean;
  /** Leaf-only: short description of what that tabular data is about. */
  tableHints?: string;
  /** Leaf-only: the section's raw content contains images. */
  hasImages?: boolean;
  /** Leaf-only: short description of what those images depict. */
  imageHints?: string;
}

/**
 * The L2 summary of a single source: the root {@link SummaryNode} (its `title`,
 * `summary`, line range are the document's; its `children` are the top-level TOC
 * items) plus persistence metadata.
 */
export interface DocumentSummary extends SummaryNode {
  uri: string;
  generated: string;
  /** SHA-256 of the source this summary was derived from (see {@link RawMeta}). */
  sourceHash: string;
  /** Schema version this summary was produced under (see {@link KNOWLEDGE_SCHEMA_VERSION}). */
  schemaVersion: number;
}

/**
 * A summarization checkpoint (`summary.tmp.json`): the leaf sections assembled by the
 * block walk SO FAR, plus where to resume. Dumped after each block so an interrupted run
 * (crash, error, kill) resumes from the last completed block instead of re-summarizing the
 * whole document. Tied to `sourceHash` + `schemaVersion` so a stale draft is discarded.
 */
export interface SummaryDraft {
  sourceHash: string;
  schemaVersion: number;
  /** Document title learned from the first block. */
  title: string;
  /** First block's document-level summary (the base for the tree root). */
  baseSummary: string;
  /** Leaf sections assembled so far, in document order. */
  sections: SummaryNode[];
  /** The 0-indexed line the next block must start at (the end of the last kept section + 1). */
  nextStart: number;
}

/** In-document-order leaf sections of a node tree — the addressable/citable unit. */
export function summaryLeaves(node: SummaryNode): SummaryNode[] {
  return !node.children || node.children.length === 0
    ? [node]
    : node.children.flatMap(summaryLeaves);
}

/** Find any node by key (depth-first), or `undefined`. */
export function findSummaryNode(node: SummaryNode, key: string): SummaryNode | undefined {
  if (node.key === key) return node;
  for (const child of node.children ?? []) {
    const found = findSummaryNode(child, key);
    if (found) return found;
  }
  return undefined;
}

/** Ancestor path root→…→node (inclusive) for `key`, or `[]` when not found. */
export function summaryPath(root: SummaryNode, key: string): SummaryNode[] {
  if (root.key === key) return [root];
  for (const child of root.children ?? []) {
    const sub = summaryPath(child, key);
    if (sub.length > 0) return [root, ...sub];
  }
  return [];
}

// ── Section embeddings (Embedder) ──────────────────────────────────────────

/**
 * Metadata for a document's per-section embeddings, stored beside the page
 * artifacts as `embeddings.<model>.<dim>.json`. The model + dimensionality are
 * part of the filename so switching embedding models never collides with a stale
 * file. The dense vectors themselves live in the sibling Arrow file
 * `embeddings.<model>.<dim>.arrow` (a `FixedSizeList<Float32>[dimensionality]`
 * column) — text-encoding float arrays in JSON is far too large. Row `i` of the
 * Arrow file corresponds to `sections[i]`.
 */
export interface DocumentEmbeddings {
  uri: string;
  generated: string;
  /** SHA-256 of the source these embeddings were derived from (see {@link RawMeta}). */
  sourceHash: string;
  /** Section-data schema version the embedded text was built under (see {@link KNOWLEDGE_SCHEMA_VERSION}). */
  schemaVersion: number;
  /** Embedding model id these vectors were produced with. */
  model: string;
  /** Vector dimensionality. */
  dimensionality: number;
  /** Section keys, in the same row order as the vectors in the Arrow sidecar. */
  sections: string[];
}

// ── L2.5 topic / outlier declarations (MetaExtractor) ───────────────────────

export interface DocumentTopic {
  key: string;
  name: string;
  /** Abstract one-line definition; present whether coined or reused (copied verbatim on reuse). */
  description?: string;
  sectionKeys: string[];
  /** This source's specific contribution to the class. */
  brief: string;
}

export interface DocumentOutlier {
  key: string;
  name: string;
  description?: string;
  globalClass?: string;
  sectionKeys: string[];
  brief: string;
  /** One sentence on what expectation the finding violates. */
  whySurprising: string;
}

export interface DocumentMeta {
  uri: string;
  generated: string;
  /** SHA-256 of the source this meta was derived from (see {@link RawMeta}). */
  sourceHash: string;
  /** Section-data schema version the meta input was read under (see {@link KNOWLEDGE_SCHEMA_VERSION}). */
  schemaVersion: number;
  topics: DocumentTopic[];
  outliers: DocumentOutlier[];
}

// ── Global aggregated indexes (Reorganizer) ─────────────────────────────────

export interface ClassReference {
  uri: string;
}

export interface GlobalTopic {
  key: string;
  name: string;
  description: string;
  references: ClassReference[];
}

export interface GlobalOutlier {
  key: string;
  name: string;
  description: string;
  references: ClassReference[];
}

/**
 * The global topic index as a bounded-fan-out DAG of two node kinds.
 *
 * A **category** ({@link TopicCategory}) is an internal node: it groups child
 * nodes by `childKeys` and carries no document references. An **index topic**
 * ({@link TopicIndexNode}) is a leaf: it aggregates per-document topic
 * references and has no children — its set is exactly the former flat
 * {@link GlobalTopic} list, so retrieval/CLI iterate `leaves()` unchanged.
 *
 * An index topic MAY be a child of more than one category and a document
 * reference MAY appear under more than one index topic (many-to-many); the
 * graph stays acyclic. Stored as an adjacency map `{ roots, nodes }` (never a
 * nested tree, which would duplicate multi-parent nodes).
 */
export interface TopicCategory {
  kind: "category";
  key: string;
  name: string;
  description: string;
  /** Child node keys (categories and/or index topics). Bounded by fan-out `B`. */
  childKeys: string[];
  /** Absorbed keys this category answers to (from promotions/merges). */
  aliases?: string[];
}

export interface TopicIndexNode {
  kind: "topic";
  key: string;
  name: string;
  description: string;
  /** Per-document topic references this leaf aggregates. Bounded by cap `R`. */
  references: ClassReference[];
  /** Absorbed keys this index topic answers to (from merges). */
  aliases?: string[];
}

export type TopicNode = TopicCategory | TopicIndexNode;

export interface TopicIndex {
  generated: string;
  /** Top-level node keys (categories and/or bare index topics). */
  roots: string[];
  /** Adjacency map: every node by its stable `key`. */
  nodes: Record<string, TopicNode>;
}

/** Narrowing guard: a category (internal node with `childKeys`). */
export function isCategory(node: TopicNode): node is TopicCategory {
  return node.kind === "category";
}

/** Narrowing guard: an index topic (leaf with `references`). */
export function isIndexTopic(node: TopicNode): node is TopicIndexNode {
  return node.kind === "topic";
}

export interface OutlierIndex {
  generated: string;
  outliers: GlobalOutlier[];
}

/** An already-coined class, supplied to the meta extractor to encourage reuse. */
export interface ExistingClass {
  kind: "topic" | "outlier";
  key: string;
  name: string;
  description: string;
}
