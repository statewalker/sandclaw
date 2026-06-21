export {
  DOC_TOPIC_EMBED_BUILDER_ID,
  DOC_TOPICS_EMBEDDED_SIGNAL,
  docTopicEmbedderBuilder,
} from "./doc-topic-embedder.js";
export { EMBED_BUILDER_ID, EMBEDDED_SIGNAL, embedderBuilder } from "./embedder.js";
export { filterUnknownSubjects, GRAPH_BUILDER_ID, GRAPH_SIGNAL, graphBuilder } from "./graph.js";
export {
  collectExistingClasses,
  WikiOutlierIndex,
  WikiTopicIndex,
} from "./indexes.js";
export {
  META_BUILDER_ID,
  META_REMOVED_TOPICS_SIGNAL,
  META_SIGNAL,
  metaBuilder,
  normalizeMeta,
} from "./meta.js";
export {
  ResourceTextContentCache,
  WikiPageEmbeddings,
  WikiPageGraph,
  WikiPageMeta,
  WikiPageSummary,
} from "./page-adapters.js";
export { pageArtifactPath, pageDirPath, projectIndexPath, resourceUri } from "./page-paths.js";
export {
  ATTRIBUTION_SYSTEM_PROMPT,
  fillCorpusPurpose,
  GRAPH_EXTRACTOR_SYSTEM_PROMPT,
  MERGE_TOPICS_SYSTEM_PROMPT,
  META_EXTRACTOR_SYSTEM_PROMPT,
  RECLUSTER_SYSTEM_PROMPT,
  REFINE_TOPIC_SYSTEM_PROMPT,
  SPLIT_CATEGORY_SYSTEM_PROMPT,
  SUMMARIZER_SYSTEM_PROMPT,
} from "./prompts.js";
export { reclusterTopics } from "./recluster.js";
export {
  ATTRIBUTE_BATCH_SIZE,
  PRUNE_BUILDER_ID,
  pruneBuilder,
  REORGANIZE_BUILDER_ID,
  reorganizeBuilder,
  TOPIC_TREE_SIGNAL,
} from "./reorganize.js";
export {
  type AttributeAction,
  type AttributeActions,
  type AttributeInput,
  attributeActionsSchema,
  attributeInputSchema,
  type DocumentGraphOutput,
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  documentGraphSchema,
  documentMetaSchema,
  documentSummarySchema,
  type MergeOutput,
  mergeClusterInputSchema,
  mergeOutputSchema,
  type NameCategoryOutput,
  nameCategoryInputSchema,
  nameCategoryOutputSchema,
  type RefineTopicOutput,
  refineTopicInputSchema,
  refineTopicOutputSchema,
  type SplitCategoryOutput,
  type SummarizerInput,
  sectionSummarySchema,
  splitCategoryInputSchema,
  splitCategoryOutputSchema,
  summarizerInputSchema,
} from "./schemas.js";
export {
  SUMMARIZE_BUILDER_ID,
  SUMMARIZED_SIGNAL,
  summarizeBuilder,
} from "./summarizer.js";
export { TOPIC_CLEANUP_BUILDER_ID, topicCleanupBuilder } from "./topic-cleanup.js";
export {
  cosine,
  WikiPageTopicEmbeddings,
  WikiTopicNodeEmbeddings,
} from "./topic-embeddings.js";
export {
  finalizeIndex,
  isAcyclic,
  leavesOf,
  migrateIndex,
} from "./topic-graph.js";
export type {
  ChapterNode,
  DocumentEmbeddings,
  DocumentGraph,
  DocumentMeta,
  DocumentOutlier,
  DocumentSummary,
  DocumentTopic,
  Entity,
  GlobalOutlier,
  GlobalTopic,
  OutlierIndex,
  Relation,
  SectionGraph,
  SectionSummary,
  Statement,
  TopicCategory,
  TopicIndex,
  TopicIndexNode,
  TopicNode,
  Triple,
} from "./types.js";
export { isCategory, isIndexTopic } from "./types.js";

/**
 * Knowledge adapters are concrete classes that self-host on their handle
 * (per-page `ResourceAdapter`s on a `Resource`, project indexes on a `Project`),
 * so no explicit registration is required. Kept as a no-op for composition-root
 * symmetry.
 */
export function registerKnowledgeAdapters(): () => void {
  return () => {};
}
