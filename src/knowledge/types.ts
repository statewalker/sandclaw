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

/** One L2 section: a contiguous range of raw lines summarised as prose. */
export interface SectionSummary {
  /** Kebab-case slug; stable across re-ingests when the section is semantically the same. */
  key: string;
  title: string;
  /** 0-indexed inclusive line range in the raw text. */
  startLine: number;
  endLine: number;
  /** Narrative summary of the section — never verbatim raw. */
  summary: string;
}

/**
 * One node of a document outline: a chapter grouping a coherent run of sections, or
 * (recursively) sub-chapters. A grouping overlay — sections remain the flat, addressable,
 * citable unit; a chapter references its members by key and is NEVER a citation target.
 */
export interface ChapterNode {
  /** Stable, document-order key; for re-ingest stability only, not cited. */
  key: string;
  title: string;
  summary: string;
  /** Leaf chapter: the section keys it groups (mutually exclusive with `children`). */
  sectionKeys?: string[];
  /** Internal chapter: sub-chapters (recursion; mutually exclusive with `sectionKeys`). */
  children?: ChapterNode[];
}

/** The L2 narrative summary of a single source. */
export interface DocumentSummary {
  uri: string;
  generated: string;
  /** SHA-256 of the source this summary was derived from (see {@link RawMeta}). */
  sourceHash: string;
  title: string;
  /** Document-level abstract, derived from the top-level chapter summaries. */
  summary: string;
  /** The flat, addressable, citable sections covering the whole document. */
  sections: SectionSummary[];
  /** The document outline: top-level chapters grouping the sections (overlay; never cited). */
  outline: ChapterNode[];
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
  topics: DocumentTopic[];
  outliers: DocumentOutlier[];
}

// ── Per-section graph (GraphExtractor) ──────────────────────────────────────

export interface Entity {
  /** Canonical name; stable across re-ingests. */
  value: string;
  /** Open enum: person, organisation, place, paper, tool, dataset, algorithm, … */
  type?: string;
}

/** `[subject, predicate, object]`. Subject MUST be an entity.value. */
export type Triple = readonly string[];
export type Statement = Triple;
export type Relation = Triple;

export interface SectionGraph {
  sectionKey: string;
  entities: Entity[];
  statements: Statement[];
  relations: Relation[];
}

export interface DocumentGraph {
  uri: string;
  generated: string;
  /** SHA-256 of the source this graph was derived from (see {@link RawMeta}). */
  sourceHash: string;
  sections: SectionGraph[];
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
