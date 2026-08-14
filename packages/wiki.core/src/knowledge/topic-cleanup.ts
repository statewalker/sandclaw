import {
  type BuilderUpdate,
  loggerOf,
  type Project,
  ProjectBuilder,
  type RegisteredBuilder,
} from "@statewalker/workspace.core";
import {
  BuildTracer,
  buildSessionOf,
  type LlmApi,
  llmOf,
  type WikiLlmConfiguration,
  wikiConfigOf,
} from "../llm/index.js";
import { WikiTopicIndex } from "./indexes.js";
import {
  fillCorpusPurpose,
  MERGE_TOPICS_SYSTEM_PROMPT,
  REFINE_TOPIC_SYSTEM_PROMPT,
  SPLIT_CATEGORY_SYSTEM_PROMPT,
} from "./prompts.js";
import { TOPIC_TREE_SIGNAL } from "./reorganize.js";
import { mergeClusterInputSchema, mergeOutputSchema } from "./schemas.js";
import { cosine, WikiTopicNodeEmbeddings } from "./topic-embeddings.js";
import { finalizeIndex, leavesOf, mergeLeaves } from "./topic-graph.js";
import { applyLocalSplits, embedNodes, toRef } from "./topic-maintenance.js";
import type { TopicIndex, TopicNode } from "./types.js";

export const TOPIC_CLEANUP_BUILDER_ID = "TopicCleanup";

/** Cosine threshold above which two index topics are near-duplicate candidates. */
const NEAR_DUP_THRESHOLD = 0.9;
/** Max members in a merge-adjudication cluster (keeps every LLM input small). */
const MAX_CLUSTER = 6;

/**
 * Group near-duplicate index topics into small vector-NN clusters. Greedy: each
 * unclaimed leaf seeds a cluster of its above-threshold neighbours, capped at
 * `MAX_CLUSTER` so no merge LLM call ever sees a large set.
 */
function nearDuplicateClusters(
  leaves: { key: string }[],
  vecs: Map<string, Float32Array>,
): string[][] {
  const claimed = new Set<string>();
  const clusters: string[][] = [];
  for (const leaf of leaves) {
    if (claimed.has(leaf.key)) continue;
    const v = vecs.get(leaf.key);
    if (!v) continue;
    const cluster = [leaf.key];
    for (const other of leaves) {
      if (other.key === leaf.key || claimed.has(other.key)) continue;
      const ov = vecs.get(other.key);
      if (ov && cosine(v, ov) >= NEAR_DUP_THRESHOLD) cluster.push(other.key);
      if (cluster.length >= MAX_CLUSTER) break;
    }
    if (cluster.length >= 2) {
      for (const k of cluster) claimed.add(k);
      clusters.push(cluster);
    }
  }
  return clusters;
}

/**
 * Merge scattered near-duplicate index topics and refine any leaf the merges left
 * overgrown. Near-duplicate detection runs over the topic vector space (mechanical,
 * no context limit); only small candidate clusters reach the LLM. Returns whether
 * the index changed.
 */
async function cleanupTopics(
  project: Project,
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
): Promise<boolean> {
  const model = cfg.embedModel;
  const dim = cfg.dimensionality;
  // Text-only wiki: no vectors → no near-duplicate detection. Nothing to clean up.
  if (!model || dim == null) return false;

  const indexAdapter = project.requireAdapter(WikiTopicIndex);
  const index: TopicIndex = await indexAdapter.read();
  const nodeStore = project.requireAdapter(WikiTopicNodeEmbeddings);
  const nodeVecs = await nodeStore.getVectors(model, dim);

  const clusters = nearDuplicateClusters(leavesOf(index), nodeVecs);
  const mergeSystem = fillCorpusPurpose(MERGE_TOPICS_SYSTEM_PROMPT, cfg.corpusPurpose);
  const reembed: TopicNode[] = [];
  let changed = false;
  for (const cluster of clusters) {
    const nodes = cluster.map((k) => index.nodes[k]).filter((n): n is TopicNode => !!n);
    if (nodes.length < 2) continue;
    const { output } = await llm.generateObject({
      name: "merge-topics",
      description: "Merge near-duplicate index topics that denote the same class.",
      model: cfg.modelFor("reorganize"),
      system: mergeSystem,
      input: { cluster: nodes.map(toRef) },
      inputSchema: mergeClusterInputSchema,
      outputSchema: mergeOutputSchema,
    });
    for (const m of output.merges) {
      const survivor = mergeLeaves(index, m.canonicalKey, m.absorbedKeys, m.name, m.description);
      if (survivor) {
        changed = true;
        nodeVecs.delete(survivor.key); // name/desc changed → re-embed
        for (const a of m.absorbedKeys) nodeVecs.delete(a);
        reembed.push(survivor);
      }
    }
  }

  // A merge can push a survivor over the leaf cap — refine it.
  const splitSystem = fillCorpusPurpose(SPLIT_CATEGORY_SYSTEM_PROMPT, cfg.corpusPurpose);
  const refineSystem = fillCorpusPurpose(REFINE_TOPIC_SYSTEM_PROMPT, cfg.corpusPurpose);
  const created = await applyLocalSplits(index, llm, cfg, splitSystem, refineSystem);
  if (created.length) changed = true;

  if (!changed) return false;
  await embedNodes(llm, model, [...reembed, ...created], nodeVecs);
  finalizeIndex(index);
  await indexAdapter.write(index);
  for (const k of [...nodeVecs.keys()]) if (!index.nodes[k]) nodeVecs.delete(k);
  await nodeStore.write(model, dim, nodeVecs);
  return true;
}

/**
 * The cleanup builder: on `topic-tree` changes, merges scattered near-duplicate
 * index topics (vector-NN clusters → bounded LLM merge adjudication) and refines
 * any leaf left overgrown. Emits no signal (no self-retrigger); idempotent — a
 * second run over a clean index finds no near-duplicates and does nothing.
 */
export function topicCleanupBuilder(): RegisteredBuilder {
  return {
    id: TOPIC_CLEANUP_BUILDER_ID,
    inputs: [TOPIC_TREE_SIGNAL],
    outputs: [],
    // biome-ignore lint/correctness/useYield: rebuilds a global artifact; emits no signal
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const log = loggerOf(project, TOPIC_CLEANUP_BUILDER_ID);
      const llm = llmOf(project);
      const cfg = wikiConfigOf(project);
      const tracer = new BuildTracer(log, TOPIC_CLEANUP_BUILDER_ID, buildSessionOf(project));
      const tracedLlm = tracer.wrap(llm);
      const pending: BuilderUpdate[] = [];
      for await (const u of builder.readUpdates({
        signal: TOPIC_TREE_SIGNAL,
        cell: TOPIC_CLEANUP_BUILDER_ID,
      })) {
        pending.push(u);
      }
      if (pending.length > 0) {
        // Clean up first; only then mark handled, so an interrupt re-triggers.
        const changed = await cleanupTopics(project, tracedLlm, cfg);
        if (changed) log.info("cleaned up topic index");
        for (const u of pending) await u.handled();
      }
      tracer.totals();
      await builder.yieldControl();
      return true;
    },
  };
}
