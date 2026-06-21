import type { Project } from "@statewalker/workspace.core";
import { llmOf, wikiConfigOf } from "../llm/index.js";
import { WikiTopicIndex } from "./indexes.js";
import { fillCorpusPurpose, RECLUSTER_SYSTEM_PROMPT } from "./prompts.js";
import { nameCategoryInputSchema, nameCategoryOutputSchema } from "./schemas.js";
import { cosine, WikiTopicNodeEmbeddings } from "./topic-embeddings.js";
import { finalizeIndex, leavesOf, uniqueKey } from "./topic-graph.js";
import { embedNodes, toRef } from "./topic-maintenance.js";
import type { TopicIndex, TopicIndexNode, TopicNode } from "./types.js";

/** Cosine threshold for grouping index topics into a category during recluster. */
const RECLUSTER_THRESHOLD = 0.6;
/** Max index topics grouped under one reclustered category. */
const RECLUSTER_MAX = 12;

/** Greedy threshold clustering of index topics by vector similarity. */
function clusterLeaves(leaves: TopicIndexNode[], vecs: Map<string, Float32Array>): string[][] {
  const claimed = new Set<string>();
  const clusters: string[][] = [];
  for (const leaf of leaves) {
    if (claimed.has(leaf.key)) continue;
    const v = vecs.get(leaf.key);
    const cluster = [leaf.key];
    claimed.add(leaf.key);
    if (v) {
      for (const other of leaves) {
        if (other.key === leaf.key || claimed.has(other.key)) continue;
        const ov = vecs.get(other.key);
        if (ov && cosine(v, ov) >= RECLUSTER_THRESHOLD) {
          cluster.push(other.key);
          claimed.add(other.key);
        }
        if (cluster.length >= RECLUSTER_MAX) break;
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

/**
 * Manually restructure the topic index's category hierarchy: cluster the index
 * topics (leaves) by embedding similarity and name a fresh category over each
 * multi-topic cluster, leaving singletons as root leaves. The index topics and
 * their references are preserved verbatim — only the grouping changes.
 *
 * Safe under interruption: the working DAG is built in memory and written
 * atomically, so an interrupt leaves the previous valid DAG and re-running
 * converges to the same structure. A text-only wiki (no embeddings) is a no-op.
 */
export async function reclusterTopics(project: Project): Promise<void> {
  await wikiConfigOf(project).load();
  const cfg = wikiConfigOf(project);
  const llm = llmOf(project);
  const model = cfg.embedModel;
  const dim = cfg.dimensionality;
  const indexAdapter = project.requireAdapter(WikiTopicIndex);
  const leaves = leavesOf(await indexAdapter.read());
  if (!model || dim == null || leaves.length === 0) return;

  const nodeStore = project.requireAdapter(WikiTopicNodeEmbeddings);
  const nodeVecs = await nodeStore.getVectors(model, dim);
  const clusters = clusterLeaves(leaves, nodeVecs);

  // Rebuild the DAG: keep every index topic, regroup under newly-named categories.
  const next: TopicIndex = { generated: new Date().toISOString(), roots: [], nodes: {} };
  for (const leaf of leaves) next.nodes[leaf.key] = { ...leaf, references: [...leaf.references] };
  const system = fillCorpusPurpose(RECLUSTER_SYSTEM_PROMPT, cfg.corpusPurpose);
  const reembed: TopicNode[] = [];
  for (const cluster of clusters) {
    if (cluster.length < 2) continue; // singletons stay as root leaves
    const nodes = cluster.map((k) => next.nodes[k]).filter((n): n is TopicNode => !!n);
    const { output } = await llm.generateObject({
      name: "name-category",
      description: "Name the category that best groups a cluster of index topics.",
      model: cfg.modelFor("reorganize"),
      system,
      input: { topics: nodes.map(toRef) },
      inputSchema: nameCategoryInputSchema,
      outputSchema: nameCategoryOutputSchema,
    });
    const key = uniqueKey(next, output.name);
    const category: TopicNode = {
      kind: "category",
      key,
      name: output.name,
      description: output.description,
      childKeys: [...cluster],
    };
    next.nodes[key] = category;
    reembed.push(category);
  }

  await embedNodes(llm, model, reembed, nodeVecs);
  finalizeIndex(next);
  await indexAdapter.write(next);
  for (const k of [...nodeVecs.keys()]) if (!next.nodes[k]) nodeVecs.delete(k);
  await nodeStore.write(model, dim, nodeVecs);
}
