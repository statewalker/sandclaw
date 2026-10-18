export interface OrderNode {
  readonly id: string;
  readonly requires?: readonly string[];
  readonly after?: readonly string[];
}

/**
 * Order `nodes` so that every node comes after the nodes it `requires` or
 * runs `after`, keeping the given order wherever the constraints allow it
 * (a stable topological sort). Unknown ids in `after` are ignored; unknown
 * ids in `requires` are left for the caller to report. Throws on a cycle.
 */
export function orderNodes<T extends OrderNode>(nodes: readonly T[]): T[] {
  const index = new Map<string, number>();
  nodes.forEach((node, i) => {
    if (index.has(node.id)) throw new Error(`Duplicate fragment id "${node.id}"`);
    index.set(node.id, i);
  });

  const indegree = nodes.map(() => 0);
  const dependents: number[][] = nodes.map(() => []);
  nodes.forEach((node, i) => {
    const deps = new Set([...(node.requires ?? []), ...(node.after ?? [])]);
    for (const dep of deps) {
      const j = index.get(dep);
      if (j === undefined || j === i) continue;
      dependents[j]?.push(i);
      indegree[i] = (indegree[i] ?? 0) + 1;
    }
  });

  const ready: number[] = [];
  indegree.forEach((d, i) => {
    if (d === 0) ready.push(i);
  });
  const result: T[] = [];
  while (ready.length > 0) {
    // Lowest original index first, so independent nodes keep their order.
    ready.sort((a, b) => a - b);
    const i = ready.shift() as number;
    result.push(nodes[i] as T);
    for (const k of dependents[i] ?? []) {
      indegree[k] = (indegree[k] ?? 0) - 1;
      if (indegree[k] === 0) ready.push(k);
    }
  }

  if (result.length < nodes.length) {
    const stuck = nodes.filter((_, i) => (indegree[i] ?? 0) > 0).map((n) => n.id);
    throw new Error(`Circular fragment dependencies among: ${stuck.join(", ")}`);
  }
  return result;
}
