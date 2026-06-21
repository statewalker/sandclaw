import {
  type BuilderUpdate,
  type EmittedUpdate,
  loggerOf,
  type Project,
  ProjectBuilder,
  type RegisteredBuilder,
  SOURCES_REMOVED_SIGNAL,
} from "@statewalker/workspace.core";
import { type LlmApi, llmOf, type WikiLlmConfiguration, wikiConfigOf } from "../llm/index.js";
import { toBatch } from "../util/batch.js";
import { DOC_TOPICS_EMBEDDED_SIGNAL } from "./doc-topic-embedder.js";
import { WikiOutlierIndex, WikiTopicIndex } from "./indexes.js";
import { META_REMOVED_TOPICS_SIGNAL } from "./meta.js";
import { WikiPageMeta } from "./page-adapters.js";
import { pageDirPath } from "./page-paths.js";
import {
  ATTRIBUTION_SYSTEM_PROMPT,
  fillCorpusPurpose,
  REFINE_TOPIC_SYSTEM_PROMPT,
  SPLIT_CATEGORY_SYSTEM_PROMPT,
} from "./prompts.js";
import { type AttributeAction, attributeActionsSchema, attributeInputSchema } from "./schemas.js";
import { cosine, WikiPageTopicEmbeddings, WikiTopicNodeEmbeddings } from "./topic-embeddings.js";
import { addRefs, coinLeaf, finalizeIndex, resolveLeaf, rootsOf } from "./topic-graph.js";
import { applyLocalSplits, embedNodes, toRef } from "./topic-maintenance.js";
import type {
  ClassReference,
  DocumentMeta,
  GlobalOutlier,
  TopicIndex,
  TopicIndexNode,
  TopicNode,
} from "./types.js";
import { isCategory } from "./types.js";

export const REORGANIZE_BUILDER_ID = "IndexReorganizer";
export const PRUNE_BUILDER_ID = "IndexPruner";
/** Emitted (project-wide) after the topic DAG changes; drives automatic cleanup. */
export const TOPIC_TREE_SIGNAL = "topic-tree";

/** Orphaned artifact directories pruned in parallel per batch. */
const PRUNE_BATCH_SIZE = 16;

/**
 * Max document-topic candidates placed per attribution LLM round, so a large
 * rebuild stays within the model's context window. The growing index is carried
 * forward between rounds (coined nodes become candidates for later batches).
 */
export const ATTRIBUTE_BATCH_SIZE = 32;

/** Embedding-nearest index nodes proposed to the LLM per candidate. */
const CANDIDATE_K = 8;

/** A leftover per-doc topic group (one distinct key) attribution must place. */
interface CandidateGroup {
  key: string;
  name: string;
  description: string;
  /** `<uri>#<topicKey>` references this group contributes. */
  refs: string[];
}

/** Document-uri portion of a `<uri>#<topicKey>` reference (or signal uri). */
function refDocUri(refUri: string): string {
  const i = refUri.indexOf("#");
  return i === -1 ? refUri : refUri.slice(0, i);
}

/** Strip every reference contributed by `docUris` (keeps now-empty classes). */
function removeDocRefs<T extends { references: ClassReference[] }>(
  items: T[],
  docUris: ReadonlySet<string>,
): T[] {
  return items.map((t) => ({
    ...t,
    references: t.references.filter((r) => !docUris.has(refDocUri(r.uri))),
  }));
}

/** Drop classes with no references and sort by key for a stable artifact. */
function pruneEmptyAndSort<T extends { key: string; references: ClassReference[] }>(
  items: T[],
): T[] {
  return items.filter((t) => t.references.length > 0).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Apply a batch's attribution actions, returning the index topics coined this
 * batch (for inline embedding). Candidates the actions leave uncovered are coined
 * by the coverage backstop so every document topic lands on ≥1 index topic.
 */
function applyAttribution(
  index: TopicIndex,
  actions: AttributeAction[],
  batch: CandidateGroup[],
): TopicIndexNode[] {
  const byKey = new Map(batch.map((g) => [g.key, g]));
  const covered = new Set<string>();
  const coined: TopicIndexNode[] = [];
  for (const action of actions) {
    const g = byKey.get(action.candidateKey);
    if (!g) continue;
    if (action.kind === "attach") {
      let any = false;
      for (const nk of action.nodeKeys) {
        const leaf = resolveLeaf(index, nk);
        if (leaf) {
          addRefs(leaf, g.refs);
          if (!leaf.description && g.description) leaf.description = g.description;
          any = true;
        }
      }
      if (any) covered.add(g.key); // unresolved nodeKeys → fall through to backstop
    } else {
      coined.push(
        coinLeaf(
          index,
          { key: g.key, name: action.name, description: action.description },
          g.refs,
          action.parentKey,
        ),
      );
      covered.add(g.key);
    }
  }
  for (const g of batch) {
    if (!covered.has(g.key)) coined.push(coinLeaf(index, g, g.refs));
  }
  return coined;
}

/** Choose the LLM-facing option set for a batch: embedding-NN nodes, else root categories. */
function selectOptions(
  index: TopicIndex,
  nodeVecs: Map<string, Float32Array>,
  candVecs: Map<string, Float32Array>,
  batch: CandidateGroup[],
  hasEmbeddings: boolean,
): ReturnType<typeof toRef>[] {
  const keys = new Set<string>();
  if (hasEmbeddings && nodeVecs.size) {
    const entries = [...nodeVecs];
    for (const g of batch) {
      const cv = candVecs.get(g.key);
      if (!cv) continue;
      const nearest = entries
        .map(([k, v]) => [k, cosine(cv, v)] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, CANDIDATE_K);
      for (const [k] of nearest) keys.add(k);
    }
  } else {
    // Bounded root-descent: propose only the root categories to nest under.
    for (const node of rootsOf(index)) if (isCategory(node)) keys.add(node.key);
  }
  return [...keys]
    .map((k) => index.nodes[k])
    .filter((n): n is TopicNode => !!n)
    .map(toRef);
}

/**
 * Attribute the touched documents' topics onto the index DAG: strip their prior
 * references, key/alias fast-path, then embedding-candidate retrieval + LLM
 * adjudication per batch (coverage backstop coins any leftover), then local
 * in-place splits. Coined/new nodes are embedded inline into the project node
 * store so they are attribution candidates in the same cycle.
 */
async function attributeTopics(
  project: Project,
  metas: Map<string, DocumentMeta>,
  touched: ReadonlySet<string>,
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  generated: string,
): Promise<{ leftovers: number }> {
  const indexAdapter = project.requireAdapter(WikiTopicIndex);
  const index = await indexAdapter.read();

  // Strip touched docs' refs from every leaf (keep now-empty leaves so a re-ingest
  // declaring the same key folds back into the SAME node — stable keys).
  for (const node of Object.values(index.nodes)) {
    if (node.kind === "topic") {
      node.references = node.references.filter((r) => !touched.has(refDocUri(r.uri)));
    }
  }

  // Group the touched docs' candidate topics by key.
  const groups = new Map<string, CandidateGroup>();
  for (const [uri, meta] of metas) {
    for (const t of meta.topics) {
      const g = groups.get(t.key) ?? {
        key: t.key,
        name: t.name,
        description: t.description ?? "",
        refs: [],
      };
      if (!g.description && t.description) g.description = t.description;
      g.refs.push(`${uri}#${t.key}`);
      groups.set(t.key, g);
    }
  }

  // Embedding setup: index-node vectors (whole, small) + the touched docs' topic
  // vectors. Absent embed model → degraded key/alias + root-descent attribution.
  const model = cfg.embedModel;
  const dim = cfg.dimensionality;
  const hasEmbeddings = !!model && dim != null;
  const nodeStore = project.requireAdapter(WikiTopicNodeEmbeddings);
  const nodeVecs = hasEmbeddings ? await nodeStore.getVectors(model!, dim!) : new Map();
  const candVecs = new Map<string, Float32Array>();
  if (hasEmbeddings) {
    for (const uri of touched) {
      const resource = await project.getProjectResource(uri);
      const vecs = await resource?.requireAdapter(WikiPageTopicEmbeddings).getVectors(model!, dim!);
      if (vecs) for (const [k, v] of vecs) if (!candVecs.has(k)) candVecs.set(k, v);
    }
  }

  // Fast path: exact key/alias match attaches mechanically (no LLM).
  const leftovers: CandidateGroup[] = [];
  for (const g of groups.values()) {
    const leaf = resolveLeaf(index, g.key);
    if (leaf) {
      addRefs(leaf, g.refs);
      if (!leaf.description && g.description) leaf.description = g.description;
    } else {
      leftovers.push(g);
    }
  }

  const attributeSystem = fillCorpusPurpose(ATTRIBUTION_SYSTEM_PROMPT, cfg.corpusPurpose);
  for await (const batch of toBatch(leftovers, ATTRIBUTE_BATCH_SIZE)) {
    const options = selectOptions(index, nodeVecs, candVecs, batch, hasEmbeddings);
    let actions: AttributeAction[] = [];
    // A round runs only when there is something to decide (options to attach/nest
    // to). With no options every leftover can only be coined — do it mechanically.
    if (options.length > 0) {
      const { output } = await llm.generateObject({
        name: "attribute-topics",
        description:
          "Attach each document-topic candidate to one or more index topics, or coin a new index topic (optionally nested under a category).",
        model: cfg.modelFor("reorganize"),
        system: attributeSystem,
        input: {
          candidates: batch.map((g) => ({ key: g.key, name: g.name, description: g.description })),
          options,
        },
        inputSchema: attributeInputSchema,
        outputSchema: attributeActionsSchema,
      });
      actions = output.actions;
    }
    const coined = applyAttribution(index, actions, batch);
    if (hasEmbeddings) await embedNodes(llm, model!, coined, nodeVecs);
  }

  // Local in-place splits keep categories/leaves bounded.
  const splitSystem = fillCorpusPurpose(SPLIT_CATEGORY_SYSTEM_PROMPT, cfg.corpusPurpose);
  const refineSystem = fillCorpusPurpose(REFINE_TOPIC_SYSTEM_PROMPT, cfg.corpusPurpose);
  const created = await applyLocalSplits(index, llm, cfg, splitSystem, refineSystem);
  if (hasEmbeddings) await embedNodes(llm, model!, created, nodeVecs);

  finalizeIndex(index);
  index.generated = generated;
  await indexAdapter.write(index);

  // Persist node vectors for the surviving nodes only (drop pruned/stale entries).
  if (hasEmbeddings) {
    for (const k of [...nodeVecs.keys()]) if (!index.nodes[k]) nodeVecs.delete(k);
    await nodeStore.write(model!, dim!, nodeVecs);
  }
  return { leftovers: leftovers.length };
}

/**
 * Incrementally fold the touched documents' outliers into the outlier index.
 * Mechanical only (merge by `globalClass ?? key`); no LLM round. Stays flat.
 */
async function reorganizeOutliers(
  project: Project,
  metas: Map<string, DocumentMeta>,
  touched: ReadonlySet<string>,
  generated: string,
): Promise<void> {
  const index = await project.requireAdapter(WikiOutlierIndex).read();
  const byKey = new Map<string, GlobalOutlier>(
    removeDocRefs(index.outliers, touched).map((o) => [
      o.key,
      { ...o, references: [...o.references] },
    ]),
  );
  for (const [uri, meta] of metas) {
    for (const o of meta.outliers) {
      const key = o.globalClass ?? o.key;
      const g = byKey.get(key) ?? {
        key,
        name: o.name,
        description: o.description ?? "",
        references: [],
      };
      if (!g.description && o.description) g.description = o.description;
      addRefs(g, [`${uri}#${o.key}`]);
      byKey.set(key, g);
    }
  }
  const outliers = pruneEmptyAndSort([...byKey.values()]);
  await project.requireAdapter(WikiOutlierIndex).write({ generated, outliers });
}

/** Read the current meta of every touched document that still exists. */
async function readTouchedMetas(
  project: Project,
  touched: ReadonlySet<string>,
): Promise<Map<string, DocumentMeta>> {
  const metas = new Map<string, DocumentMeta>();
  for (const uri of touched) {
    const resource = await project.getProjectResource(uri);
    const meta = await resource?.getAdapter(WikiPageMeta)?.get();
    if (meta) metas.set(uri, meta);
  }
  return metas;
}

/**
 * The reorganizer: on any document-topics-embedded change, removed declaration, or
 * removed source, drains those updates and attributes only the touched documents'
 * topics onto the global topic DAG (and folds outliers). Each touched document's
 * prior references are stripped first; candidates that don't key/alias match go
 * through embedding-candidate retrieval + an LLM adjudication round, then local
 * in-place splits keep nodes bounded. Emits `topic-tree` so cleanup can run.
 */
export function reorganizeBuilder(): RegisteredBuilder {
  const inputs = [DOC_TOPICS_EMBEDDED_SIGNAL, META_REMOVED_TOPICS_SIGNAL, SOURCES_REMOVED_SIGNAL];
  return {
    id: REORGANIZE_BUILDER_ID,
    inputs,
    outputs: [TOPIC_TREE_SIGNAL],
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const log = loggerOf(project, REORGANIZE_BUILDER_ID);
      const llm = llmOf(project);
      const cfg = wikiConfigOf(project);
      const pending: BuilderUpdate[] = [];
      const touched = new Set<string>();
      let stamp = 0;
      for (const signal of inputs) {
        for await (const u of builder.readUpdates({ signal, cell: REORGANIZE_BUILDER_ID })) {
          pending.push(u);
          touched.add(refDocUri(u.uri));
          stamp = Math.max(stamp, u.stamp);
        }
      }
      if (pending.length > 0) {
        // Attribute first; only then mark the inputs handled, so an interrupted run
        // re-triggers attribution rather than silently skipping it.
        const metas = await readTouchedMetas(project, touched);
        const generated = new Date().toISOString();
        const { leftovers } = await attributeTopics(project, metas, touched, llm, cfg, generated);
        await reorganizeOutliers(project, metas, touched, generated);
        log.info("reorganized indexes", { touched: touched.size, leftovers });
        const emitted: EmittedUpdate = { signal: TOPIC_TREE_SIGNAL, uri: "topics.json", stamp };
        yield emitted;
        for (const u of pending) await u.handled();
      }
      await builder.yieldControl();
      return true;
    },
  };
}

/**
 * The pruner: on source removal, deletes that source's orphaned per-page artifact
 * directory under the project system folder.
 */
export function pruneBuilder(): RegisteredBuilder {
  return {
    id: PRUNE_BUILDER_ID,
    inputs: [SOURCES_REMOVED_SIGNAL],
    outputs: [],
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const log = loggerOf(project, PRUNE_BUILDER_ID);
      const source = builder.readUpdates({
        signal: SOURCES_REMOVED_SIGNAL,
        cell: PRUNE_BUILDER_ID,
      });
      for await (const batch of toBatch(source, PRUNE_BATCH_SIZE)) {
        await Promise.all(batch.map(handleEntry));
        if (!(await builder.yieldControl())) return false;
      }
      return true;

      async function handleEntry(u: BuilderUpdate): Promise<void> {
        try {
          log.debug("pruning artifacts", { uri: u.uri });
          await project.workspace.files.remove(pageDirPath(project.root, u.uri));
        } catch {
          // already gone — fine
        } finally {
          await u.handled();
        }
      }
    },
  };
}
