import { loggerOf, type Project } from "@statewalker/workspace.core";
import { WikiTopicIndex } from "../../knowledge/indexes.js";
import { cosine, WikiTopicNodeEmbeddings } from "../../knowledge/topic-embeddings.js";
import { childrenOf, rootsOf } from "../../knowledge/topic-graph.js";
import type { DocumentMeta, TopicIndex, TopicIndexNode, TopicNode } from "../../knowledge/types.js";
import { isCategory, isIndexTopic } from "../../knowledge/types.js";
import type { LlmApi, WikiLlmConfiguration } from "../../llm/index.js";
import { mapLimit } from "../../util/batch.js";
import type { QueryProgress } from "../progress.js";
import { timedGenerate } from "./llm-call.js";
import { TOPIC_DESCENT_PROMPT } from "./prompts.js";
import { buildDocTopicCandidates } from "./retrieval.js";
import { topicDescentInputSchema, topicDescentSchema } from "./schemas.js";

/** Entry nodes seeded by subject-vs-node similarity when embeddings are present. */
const ENTRY_SEED_K = 8;
/** Nodes per descent LLM call — bounds each call's input by fan-out, not corpus size. */
const DESCENT_BATCH = 16;
/** Parallel descent calls in flight per level. */
const DESCENT_CONCURRENCY = 5;

/** Split an array into fixed-size chunks (the last may be shorter). */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The `ENTRY_SEED_K` nodes whose stored vector is most similar to the subject. */
function topEntryNodes(
  index: TopicIndex,
  nodeVecs: Map<string, Float32Array>,
  subjectVec: Float32Array,
  k: number,
): TopicNode[] {
  const scored: { node: TopicNode; sim: number }[] = [];
  for (const [key, vec] of nodeVecs) {
    const node = index.nodes[key];
    if (node) scored.push({ node, sim: cosine(subjectVec, vec) });
  }
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, k).map((s) => s.node);
}

/** Project a DAG node to the descent LLM's option shape (a category carries its children). */
function toDescentNode(index: TopicIndex, node: TopicNode) {
  return {
    key: node.key,
    name: node.name,
    description: node.description || undefined,
    kind: node.kind,
    children: isCategory(node)
      ? childrenOf(index, node.key).map((c) => ({
          key: c.key,
          name: c.name,
          description: c.description || undefined,
        }))
      : [],
  };
}

/**
 * The topic front-end for one subject: embedding-seeded, `0/1/2`-scored descent over
 * the `topic-index` DAG. Embeds the subject, seeds entry nodes by cosine vs
 * `WikiTopicNodeEmbeddings`, then scores the frontier in bounded batches — pruning
 * score-0, collecting relevant index topics (leaves), and descending into the
 * children the LLM chose. A text-only wiki (no embed model or empty node store)
 * descends from `roots()` instead. Relevant index topics expand to candidate
 * sections via `buildDocTopicCandidates` (`references` → `DocumentTopic.sectionKeys`).
 *
 * The relevance scores stay INTERNAL — they prune the descent only; the emitted
 * `{ uri, sectionKey }[]` is the same shape the flat front-end produced, so the
 * global overlap tiers are unaffected (ADR 0001).
 */
export async function topicDescent(
  project: Project,
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  progress: QueryProgress,
  subjectPrompt: string,
  metaCache: Map<string, DocumentMeta | undefined>,
): Promise<{ uri: string; sectionKey: string }[]> {
  const index = await project.requireAdapter(WikiTopicIndex).read();
  if (Object.keys(index.nodes).length === 0) return [];
  const log = loggerOf(project, "QueryFsm");

  // Seed the frontier: embedding-nearest entry nodes when a model is configured and
  // the node store is populated; otherwise the root categories (text-only fallback).
  const model = cfg.embedModel;
  const dim = cfg.dimensionality;
  let frontier: TopicNode[] = rootsOf(index);
  if (model && dim != null) {
    const nodeVecs = await project.requireAdapter(WikiTopicNodeEmbeddings).getVectors(model, dim);
    if (nodeVecs.size > 0) {
      const subjectVec = await llm.embed(subjectPrompt, model);
      frontier = topEntryNodes(index, nodeVecs, subjectVec, ENTRY_SEED_K);
    }
  }

  // Bounded scored descent. The visited set guarantees termination on the (finite,
  // acyclic) DAG even with multi-parent nodes.
  const relevantLeaves = new Set<string>();
  const visited = new Set<string>();
  while (frontier.length > 0) {
    const level = frontier.filter((n) => !visited.has(n.key));
    for (const n of level) visited.add(n.key);
    if (level.length === 0) break;
    const byKey = new Map(level.map((n) => [n.key, n]));

    const batches = chunk(level, DESCENT_BATCH);
    const startedAt = Date.now();
    const results = await mapLimit(batches, DESCENT_CONCURRENCY, (nodes) =>
      timedGenerate(llm, log, progress, {
        name: "topic-descent",
        description:
          "Score a batch of topic-index nodes for the subject; pick children to descend.",
        model: cfg.modelFor("query"),
        system: TOPIC_DESCENT_PROMPT,
        input: { subject: subjectPrompt, nodes: nodes.map((n) => toDescentNode(index, n)) },
        inputSchema: topicDescentInputSchema,
        outputSchema: topicDescentSchema,
        strict: true,
      }),
    );

    const next: TopicNode[] = [];
    for (const { output } of results) {
      for (const v of output.nodes) {
        if (v.relevance <= 0) continue; // prune score-0 branches
        const node = byKey.get(v.key);
        if (!node) continue;
        if (isIndexTopic(node)) {
          relevantLeaves.add(node.key);
        } else {
          // A relevant category: enqueue the children the LLM chose to descend.
          for (const ck of v.descendKeys) {
            const child = index.nodes[ck];
            if (child && node.childKeys.includes(ck) && !visited.has(ck)) next.push(child);
          }
        }
      }
    }
    log.info("topic descent level", {
      scored: level.length,
      calls: batches.length,
      ms: Date.now() - startedAt,
      relevantSoFar: relevantLeaves.size,
    });
    frontier = next;
  }

  // Expand relevant index topics → per-document topic candidates → sections.
  const selTopics = [...relevantLeaves]
    .map((k) => index.nodes[k])
    .filter((n): n is TopicIndexNode => !!n && isIndexTopic(n));
  const candidates = await buildDocTopicCandidates(project, selTopics, (m) => m.topics, metaCache);
  return candidates.flatMap((c) => c.sectionKeys.map((sk) => ({ uri: c.baseUri, sectionKey: sk })));
}
