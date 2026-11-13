import {
  loggerOf,
  type Project,
  type RegisteredBuilder,
  SOURCES_COLLECTION,
} from "@statewalker/workspace.core";
import {
  BuildTracer,
  buildSessionOf,
  type LlmApi,
  llmOf,
  type WikiLlmConfiguration,
  wikiConfigOf,
} from "../llm/index.js";
import { toBatch } from "../util/batch.js";
import { isSourceGone, settleDeferred } from "../util/deferred-sources.js";
import { DOC_TOPICS_EMBEDDED_SIGNAL } from "./doc-topic-embedder.js";
import { WikiOutlierIndex, WikiTopicIndex } from "./indexes.js";
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
/** Collection with one project-wide row (`topics.json`) that changes with the topic DAG; drives automatic cleanup. */
export const TOPIC_TREE_SIGNAL = "topic-tree";

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
    for (const uri of metas.keys()) {
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
          candidates: batch.map((g) => ({
            key: g.key,
            name: g.name,
            description: g.description,
          })),
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

/** Every document uri the persisted topic + outlier indexes still reference. */
async function referencedDocs(project: Project): Promise<Set<string>> {
  const uris = new Set<string>();
  const index = await project.requireAdapter(WikiTopicIndex).read();
  for (const node of Object.values(index.nodes)) {
    if (node.kind === "topic") for (const r of node.references) uris.add(refDocUri(r.uri));
  }
  const outliers = await project.requireAdapter(WikiOutlierIndex).read();
  for (const o of outliers.outliers) for (const r of o.references) uris.add(refDocUri(r.uri));
  return uris;
}

/**
 * What the reorganizer carries between runs: the `generated` stamp of the last tree it
 * wrote, and the referenced documents a full pass deferred (not scanned yet).
 */
interface ReorganizeState {
  generated: string | null;
  deferred?: string[];
}

/**
 * The reorganizer: an incremental reduce builder over `doc-topics-embedded`. The
 * documents whose row changed since its last run — added, re-declared (the row carries
 * the topic keys), or removed (a removed source retracts its whole chain) — are the
 * touched documents: their prior references are stripped from the global topic DAG and
 * the current declarations of those still present are attributed (key/alias fast path,
 * then embedding-candidate retrieval + an LLM adjudication round, then local in-place
 * splits keep nodes bounded); outliers are folded likewise. Without a saved state (first
 * run, or after `restartFrom`) every listed document — plus every document the indexes
 * still reference, so stale references are stripped — is touched. Emits
 * `topic-tree/topics.json` with the tree's `generated` stamp, so cleanup runs after each
 * change. A failure keeps the pending changes: the next run sees them again.
 */
export function reorganizeBuilder(): RegisteredBuilder {
  return {
    id: REORGANIZE_BUILDER_ID,
    kind: "reduce",
    incremental: true,
    inputs: [DOC_TOPICS_EMBEDDED_SIGNAL],
    // A full pass (and its deferred documents) checks whether a document was scanned.
    reads: [SOURCES_COLLECTION],
    outputs: [TOPIC_TREE_SIGNAL],
    async run(ctx, project) {
      const log = loggerOf(project, REORGANIZE_BUILDER_ID);
      const state = ctx.state as ReorganizeState | undefined;
      const touched = new Set<string>();
      const present = new Set<string>();
      let deferred: string[] = [];
      if (state === undefined) {
        for (const row of await ctx.list(DOC_TOPICS_EMBEDDED_SIGNAL)) {
          touched.add(row.key);
          present.add(row.key);
        }
        // A document the indexes reference but no row lists is stripped only when it is
        // really gone: scanned without producing topics (its `sources` row exists), or
        // deleted. One not scanned yet (a scan batch still to come, e.g. the first build
        // after an upgrade) keeps its references and is re-checked on later runs.
        for (const uri of await referencedDocs(project)) {
          if (present.has(uri)) continue;
          if (await isSourceGone(ctx, project, uri)) touched.add(uri);
          else deferred.push(uri);
        }
      } else {
        for (const c of await ctx.changes(DOC_TOPICS_EMBEDDED_SIGNAL)) {
          touched.add(c.key);
          if (c.value !== undefined) present.add(c.key);
        }
        // Deferred documents scanned since without producing topics (or deleted): strip.
        const settled = await settleDeferred(
          ctx,
          project,
          DOC_TOPICS_EMBEDDED_SIGNAL,
          state.deferred ?? [],
        );
        for (const uri of settled.gone) touched.add(uri);
        deferred = settled.pending;
      }
      let generated = state?.generated ?? null;
      if (touched.size > 0) {
        const cfg = wikiConfigOf(project);
        const tracer = new BuildTracer(log, REORGANIZE_BUILDER_ID, buildSessionOf(project));
        const tracedLlm = tracer.wrap(llmOf(project));
        const metas = await readTouchedMetas(project, present);
        generated = new Date().toISOString();
        const { leftovers } = await attributeTopics(
          project,
          metas,
          touched,
          tracedLlm,
          cfg,
          generated,
        );
        await reorganizeOutliers(project, metas, touched, generated);
        log.info("reorganized indexes", { touched: touched.size, leftovers });
        tracer.totals();
      }
      // Re-emit the last stamp when nothing was touched (an unchanged row: no cleanup run).
      if (generated !== null) ctx.emit(TOPIC_TREE_SIGNAL, "topics.json", generated);
      ctx.setState({ generated, deferred } satisfies ReorganizeState);
    },
  };
}

/**
 * The pruner: a map builder over `sources` that emits nothing; when a source is gone
 * (deleted, or newly ignored) its task dies and `dispose` deletes that source's orphaned
 * per-page artifact directory under the project system folder.
 */
export function pruneBuilder(): RegisteredBuilder {
  return {
    id: PRUNE_BUILDER_ID,
    inputs: [SOURCES_COLLECTION],
    outputs: [],
    run() {
      // Nothing to build: the task exists only so its death (source removal) is observed.
    },
    async dispose(key, _outputs, project) {
      loggerOf(project, PRUNE_BUILDER_ID).debug("pruning artifacts", { uri: key });
      try {
        await project.workspace.files.remove(pageDirPath(project.root, key));
      } catch {
        // already gone — fine
      }
    },
  };
}
