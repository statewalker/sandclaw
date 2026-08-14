import {
  type ClassReference,
  isCategory,
  isIndexTopic,
  type TopicCategory,
  type TopicIndex,
  type TopicIndexNode,
  type TopicNode,
} from "./types.js";

/** A fresh empty DAG (no roots, no nodes) — never share, callers mutate it. */
export function emptyIndex(): TopicIndex {
  return { generated: "", roots: [], nodes: {} };
}

/** A legacy flat global topic, as stored in the pre-DAG `{ topics: [] }` artifact. */
interface LegacyTopic {
  key: string;
  name: string;
  description?: string;
  references?: ClassReference[];
}

/**
 * Lift any persisted topics artifact into a valid DAG. A new-shape
 * `{ roots, nodes }` is returned as-is; a legacy flat `{ topics: [] }` is lifted
 * so every former topic becomes an index topic directly under `roots` (no data
 * loss, no migration tooling); anything unrecognised yields an empty DAG.
 */
export function migrateIndex(raw: unknown): TopicIndex {
  if (!raw || typeof raw !== "object") return emptyIndex();
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.roots) && obj.nodes && typeof obj.nodes === "object") {
    return raw as TopicIndex;
  }
  const generated = typeof obj.generated === "string" ? obj.generated : "";
  const legacy = Array.isArray(obj.topics) ? (obj.topics as LegacyTopic[]) : [];
  const nodes: Record<string, TopicNode> = {};
  const roots: string[] = [];
  for (const t of legacy) {
    if (!t?.key || nodes[t.key]) continue;
    nodes[t.key] = {
      kind: "topic",
      key: t.key,
      name: t.name,
      description: t.description ?? "",
      references: t.references ?? [],
    };
    roots.push(t.key);
  }
  return { generated, roots, nodes };
}

/** Map every alias to its surviving node key (built lazily per call site). */
export function aliasMap(index: TopicIndex): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of Object.values(index.nodes)) {
    for (const alias of node.aliases ?? []) map.set(alias, node.key);
  }
  return map;
}

/** Resolve a key (or one of its aliases) to the surviving node, if any. */
export function getNode(index: TopicIndex, key: string): TopicNode | undefined {
  const direct = index.nodes[key];
  if (direct) return direct;
  const survivor = aliasMap(index).get(key);
  return survivor ? index.nodes[survivor] : undefined;
}

/** Resolve a key/alias to a surviving index TOPIC (leaf), if it resolves to one. */
export function resolveLeaf(index: TopicIndex, key: string): TopicIndexNode | undefined {
  const node = getNode(index, key);
  return node && isIndexTopic(node) ? node : undefined;
}

/** Every index topic (leaf), sorted by key for a stable artifact. */
export function leavesOf(index: TopicIndex): TopicIndexNode[] {
  return Object.values(index.nodes)
    .filter(isIndexTopic)
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Every category (internal node), sorted by key. */
export function categoriesOf(index: TopicIndex): TopicCategory[] {
  return Object.values(index.nodes)
    .filter(isCategory)
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** The root nodes (categories and/or bare index topics), in stored order. */
export function rootsOf(index: TopicIndex): TopicNode[] {
  return index.roots.map((k) => index.nodes[k]).filter((n): n is TopicNode => !!n);
}

/** The direct child nodes of a category key (empty for a leaf or unknown key). */
export function childrenOf(index: TopicIndex, key: string): TopicNode[] {
  const node = getNode(index, key);
  if (!node || !isCategory(node)) return [];
  return node.childKeys.map((k) => index.nodes[k]).filter((n): n is TopicNode => !!n);
}

// ── Mutation helpers (shared by attribution, splits, cleanup, recluster) ─────

/** Kebab-case slug for a coined node key, derived from a name. */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "topic"
  );
}

/** A node key unique within `index`, derived from `base` (`base`, `base-2`, …). */
export function uniqueKey(index: TopicIndex, base: string): string {
  const slug = slugify(base);
  if (!index.nodes[slug]) return slug;
  for (let i = 2; ; i++) {
    const candidate = `${slug}-${i}`;
    if (!index.nodes[candidate]) return candidate;
  }
}

/** Append references to a class (index topic or outlier), skipping present URIs. */
export function addRefs(node: { references: ClassReference[] }, uris: Iterable<string>): void {
  for (const uri of uris) {
    if (!node.references.some((r) => r.uri === uri)) node.references.push({ uri });
  }
}

/**
 * Coin a new index topic (leaf). Reuses `key` when free (stable re-ingest
 * fold-back), else a derived unique key. Nests under `parentKey` when it names a
 * category, otherwise leaves it for `finalizeIndex` to surface as a root.
 */
export function coinLeaf(
  index: TopicIndex,
  spec: { key: string; name: string; description: string },
  refs: string[],
  parentKey?: string,
): TopicIndexNode {
  const key = index.nodes[spec.key] ? uniqueKey(index, spec.name) : spec.key;
  const node: TopicIndexNode = {
    kind: "topic",
    key,
    name: spec.name,
    description: spec.description,
    references: refs.map((uri) => ({ uri })),
  };
  index.nodes[key] = node;
  const parent = parentKey ? index.nodes[parentKey] : undefined;
  if (parent && isCategory(parent) && !parent.childKeys.includes(key)) parent.childKeys.push(key);
  return node;
}

/**
 * Promote an over-capacity index topic to a category in place, partitioning its
 * references into child index topics by sub-theme. Keeps the node key (and
 * aliases) so re-ingest still folds back. Any reference not covered by a sub-theme
 * is attached to the first child so none is lost.
 */
export function promoteLeafToCategory(
  index: TopicIndex,
  leafKey: string,
  subthemes: { name: string; description: string; refUris: string[] }[],
): void {
  const leaf = index.nodes[leafKey];
  if (!leaf || !isIndexTopic(leaf) || subthemes.length === 0) return;
  const allRefs = new Set(leaf.references.map((r) => r.uri));
  const category: TopicCategory = {
    kind: "category",
    key: leaf.key,
    name: leaf.name,
    description: leaf.description,
    childKeys: [],
    ...(leaf.aliases ? { aliases: leaf.aliases } : {}),
  };
  index.nodes[leafKey] = category;
  const assigned = new Set<string>();
  const children: TopicIndexNode[] = [];
  for (const st of subthemes) {
    const refs = st.refUris.filter((u) => allRefs.has(u) && !assigned.has(u));
    for (const u of refs) assigned.add(u);
    const child = coinLeaf(
      index,
      { key: slugify(st.name), name: st.name, description: st.description },
      refs,
      leafKey,
    );
    children.push(child);
  }
  // Catch-all: references no sub-theme claimed stay under the first child.
  const leftovers = [...allRefs].filter((u) => !assigned.has(u));
  if (leftovers.length && children[0]) addRefs(children[0], leftovers);
}

/**
 * Split an over-capacity category in place: each sub-group becomes a child
 * category that absorbs the listed children, dropping the category's direct
 * fan-out below `B`. Children not placed in any sub-group stay direct.
 */
export function splitCategoryInPlace(
  index: TopicIndex,
  categoryKey: string,
  subgroups: { name: string; description: string; childKeys: string[] }[],
): void {
  const category = index.nodes[categoryKey];
  if (!category || !isCategory(category) || subgroups.length === 0) return;
  const direct = new Set(category.childKeys);
  const moved = new Set<string>();
  const newChildren: string[] = [];
  for (const sg of subgroups) {
    const members = sg.childKeys.filter((k) => direct.has(k) && !moved.has(k) && index.nodes[k]);
    if (members.length === 0) continue;
    for (const k of members) moved.add(k);
    const subKey = uniqueKey(index, sg.name);
    index.nodes[subKey] = {
      kind: "category",
      key: subKey,
      name: sg.name,
      description: sg.description,
      childKeys: members,
    };
    newChildren.push(subKey);
  }
  category.childKeys = [...category.childKeys.filter((k) => !moved.has(k)), ...newChildren];
}

/**
 * Merge index topics that denote the same class into a canonical survivor: union
 * their references and parent categories, record absorbed keys (and their aliases)
 * as aliases on the survivor, and re-point parent edges. Keys not resolving to
 * index topics are ignored. Returns the survivor (renamed/redescribed), or
 * undefined when the canonical key is not a mergeable leaf.
 */
export function mergeLeaves(
  index: TopicIndex,
  canonicalKey: string,
  absorbedKeys: string[],
  name: string,
  description: string,
): TopicIndexNode | undefined {
  const survivor = index.nodes[canonicalKey];
  if (!survivor || !isIndexTopic(survivor)) return undefined;
  const aliases = new Set(survivor.aliases ?? []);
  for (const absorbedKey of absorbedKeys) {
    const absorbed = index.nodes[absorbedKey];
    if (!absorbed || !isIndexTopic(absorbed) || absorbedKey === canonicalKey) continue;
    addRefs(
      survivor,
      absorbed.references.map((r) => r.uri),
    );
    aliases.add(absorbedKey);
    for (const a of absorbed.aliases ?? []) aliases.add(a);
    // Re-point every parent category from the absorbed node to the survivor.
    for (const node of Object.values(index.nodes)) {
      if (isCategory(node) && node.childKeys.includes(absorbedKey)) {
        node.childKeys = [
          ...new Set(node.childKeys.map((k) => (k === absorbedKey ? canonicalKey : k))),
        ];
      }
    }
    delete index.nodes[absorbedKey];
  }
  survivor.name = name;
  survivor.description = description;
  if (aliases.size) survivor.aliases = [...aliases].sort();
  return survivor;
}

/**
 * Restore structural invariants after a batch of mutations: drop dangling child
 * keys and duplicates, prune zero-reference leaves (and categories left childless)
 * bottom-up, then recompute `roots` as the nodes no category claims as a child.
 */
export function finalizeIndex(index: TopicIndex): void {
  // Dedupe + drop dangling childKeys.
  for (const node of Object.values(index.nodes)) {
    if (isCategory(node)) {
      node.childKeys = [...new Set(node.childKeys)].filter((k) => index.nodes[k]);
    }
  }
  // Prune empties bottom-up until stable.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, node] of Object.entries(index.nodes)) {
      const dead = isIndexTopic(node)
        ? node.references.length === 0
        : node.childKeys.filter((k) => index.nodes[k]).length === 0;
      if (dead) {
        delete index.nodes[key];
        changed = true;
      }
    }
    for (const node of Object.values(index.nodes)) {
      if (isCategory(node)) node.childKeys = node.childKeys.filter((k) => index.nodes[k]);
    }
  }
  const claimed = new Set<string>();
  for (const node of Object.values(index.nodes)) {
    if (isCategory(node)) for (const k of node.childKeys) claimed.add(k);
  }
  index.roots = Object.keys(index.nodes)
    .filter((k) => !claimed.has(k))
    .sort();
}

/** No node reachable from itself via `childKeys` (DFS from every root). */
export function isAcyclic(index: TopicIndex): boolean {
  const state = new Map<string, 0 | 1 | 2>(); // 1 = on stack, 2 = done
  const visit = (key: string): boolean => {
    const node = index.nodes[key];
    if (!node || !isCategory(node)) return true;
    const s = state.get(key);
    if (s === 1) return false; // back-edge → cycle
    if (s === 2) return true;
    state.set(key, 1);
    for (const child of node.childKeys) if (!visit(child)) return false;
    state.set(key, 2);
    return true;
  };
  return index.roots.every(visit);
}
