import type { LlmApi, WikiLlmConfiguration } from "../llm/index.js";
import {
  refineTopicInputSchema,
  refineTopicOutputSchema,
  splitCategoryInputSchema,
  splitCategoryOutputSchema,
} from "./schemas.js";
import {
  categoriesOf,
  childrenOf,
  leavesOf,
  promoteLeafToCategory,
  splitCategoryInPlace,
} from "./topic-graph.js";
import type { TopicIndex, TopicNode } from "./types.js";

/** A node's embedding text — what attribution/cleanup match against. */
export function nodeText(node: { name: string; description: string }): string {
  return node.description.trim() ? `${node.name}\n${node.description.trim()}` : node.name;
}

/** Project a node to the LLM-facing option shape (key + name + description + kind). */
export function toRef(node: TopicNode): {
  key: string;
  name: string;
  description: string;
  kind: "category" | "topic";
} {
  return { key: node.key, name: node.name, description: node.description, kind: node.kind };
}

/** Per-document topic key portion of a `<uri>#<topicKey>` reference. */
function refTopicKey(refUri: string): string {
  const i = refUri.indexOf("#");
  return i === -1 ? refUri : refUri.slice(i + 1);
}

/** Embed nodes lacking a vector and register them in the in-memory node store. */
export async function embedNodes(
  llm: LlmApi,
  model: string,
  nodes: TopicNode[],
  nodeVecs: Map<string, Float32Array>,
): Promise<void> {
  const todo = nodes.filter((n) => !nodeVecs.has(n.key));
  if (!todo.length) return;
  const vectors = await llm.embedBatch(todo.map(nodeText), model);
  todo.forEach((n, i) => {
    const v = vectors[i];
    if (v) nodeVecs.set(n.key, v);
  });
}

/**
 * Keep nodes bounded with local in-place splits: a category over fan-out `B` is
 * split into sub-categories; an index topic over reference cap `R` is refined and
 * promoted to a category partitioning its references. Both are heuristic — an
 * empty LLM result declines the split, leaving the node oversized. Returns the
 * nodes created (for inline embedding by the caller).
 */
export async function applyLocalSplits(
  index: TopicIndex,
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  splitSystem: string,
  refineSystem: string,
): Promise<TopicNode[]> {
  const B = cfg.topicFanout;
  const R = cfg.topicLeafCap;
  const model = cfg.modelFor("reorganize");
  const created: TopicNode[] = [];

  for (const cat of categoriesOf(index)) {
    if (cat.childKeys.length <= B) continue;
    const before = new Set(Object.keys(index.nodes));
    const { output } = await llm.generateObject({
      name: "split-category",
      description: "Partition an over-large category's children into coherent sub-categories.",
      model,
      system: splitSystem,
      input: { category: toRef(cat), children: childrenOf(index, cat.key).map(toRef) },
      inputSchema: splitCategoryInputSchema,
      outputSchema: splitCategoryOutputSchema,
    });
    if (output.subcategories.length) {
      splitCategoryInPlace(index, cat.key, output.subcategories);
      for (const k of Object.keys(index.nodes)) {
        if (!before.has(k)) created.push(index.nodes[k]!);
      }
    }
  }

  for (const leaf of leavesOf(index)) {
    if (leaf.references.length <= R) continue;
    const members = leaf.references.map((r, i) => ({
      id: `m${i}`,
      name: refTopicKey(r.uri),
      brief: "",
    }));
    const before = new Set(Object.keys(index.nodes));
    const { output } = await llm.generateObject({
      name: "refine-topic",
      description: "Cluster an over-large index topic's references into finer sub-themes.",
      model,
      system: refineSystem,
      input: { topic: toRef(leaf), members },
      inputSchema: refineTopicInputSchema,
      outputSchema: refineTopicOutputSchema,
    });
    if (output.subthemes.length) {
      const subthemes = output.subthemes.map((st) => ({
        name: st.name,
        description: st.description,
        refUris: st.memberIds
          .map((id) => leaf.references[Number(id.replace(/^m/, ""))]?.uri)
          .filter((u): u is string => !!u),
      }));
      promoteLeafToCategory(index, leaf.key, subthemes);
      for (const k of Object.keys(index.nodes)) {
        if (!before.has(k)) created.push(index.nodes[k]!);
      }
    }
  }
  return created;
}
