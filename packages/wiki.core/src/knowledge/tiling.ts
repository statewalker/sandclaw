import { type SummaryNode, summaryLeaves } from "./types.js";

/** A section placed in a block: the model's payload with its derived inclusive line range. */
export type Placed<T> = Omit<T, "startLine" | "endLine"> & {
  startLine: number;
  endLine: number;
};

/**
 * Turn the model's cut points for one block into contiguous sections covering
 * `blockStart … blockEnd` (inclusive) exactly. Each section's `startLine` is its cut: cuts are
 * clamped into the block, sorted, and de-duplicated (the first section at a line wins); the first
 * section always starts at `blockStart`; section i ends where section i+1 begins, the last at
 * `blockEnd`. Any `endLine` on the input is ignored — ranges are derived, never taken from the model,
 * so the block is tiled by construction.
 */
export function cutsToRanges<T extends { startLine: number }>(
  sections: T[],
  blockStart: number,
  blockEnd: number,
): Placed<T>[] {
  const clamp = (n: number) => Math.min(Math.max(n, blockStart), blockEnd);
  const sorted = sections
    .map((s) => ({ s, cut: clamp(s.startLine) }))
    .sort((a, b) => a.cut - b.cut);
  const kept: { s: T; cut: number }[] = [];
  for (const it of sorted) if (kept.at(-1)?.cut !== it.cut) kept.push(it);
  if (kept[0]) kept[0].cut = blockStart;
  return kept.map((it, i) => ({
    ...it.s,
    startLine: it.cut,
    endLine: (kept[i + 1]?.cut ?? blockEnd + 1) - 1,
  }));
}

/** What `tileSummary` changed, for the build trace. */
export interface TilingStats {
  /** Lines that were in no leaf and now belong to a neighbouring leaf. */
  absorbedLines: number;
  /** Lines removed from a leaf because the previous leaf already held them. */
  trimmedLines: number;
  /** Leaves removed because nothing was left of them after clamping and trimming. */
  droppedLeaves: number;
}

/**
 * Make a summary tree's leaves partition `0 … lineCount − 1`, with no LLM call. Leaves are taken in
 * document (tree) order: each is clamped to the text and trimmed to start after its predecessor; a
 * gap is absorbed into the preceding leaf (a leading gap into the first, a trailing gap into the
 * last); a leaf left empty is removed, and so is an internal node left without children. Internal
 * spans are recomputed from their children. The input is not mutated.
 */
export function tileSummary<T extends SummaryNode>(
  root: T,
  lineCount: number,
): { root: T; stats: TilingStats } {
  const last = lineCount - 1;
  const tree = structuredClone(root);
  const stats: TilingStats = { absorbedLines: 0, trimmedLines: 0, droppedLeaves: 0 };
  const dropped = new Set<SummaryNode>();
  let prev: SummaryNode | undefined;
  for (const leaf of summaryLeaves(tree)) {
    const floor = prev ? prev.endLine + 1 : 0;
    const start = Math.max(leaf.startLine, floor);
    const end = Math.min(leaf.endLine, last);
    if (end < start) {
      dropped.add(leaf);
      stats.droppedLeaves++;
      continue;
    }
    stats.trimmedLines += Math.max(0, floor - Math.max(leaf.startLine, 0));
    stats.absorbedLines += start - floor;
    if (prev) prev.endLine = start - 1;
    leaf.startLine = prev ? start : 0;
    leaf.endLine = end;
    prev = leaf;
  }
  if (!prev) {
    // Nothing usable survived: the whole document becomes the root as a single leaf.
    const { children: _, ...rest } = tree;
    return { root: { ...rest, startLine: 0, endLine: last } as T, stats };
  }
  stats.absorbedLines += last - prev.endLine;
  prev.endLine = last;
  return { root: prune(tree, dropped) as T, stats };
}

/** Remove dropped leaves and emptied internal nodes; recompute internal spans. */
function prune(node: SummaryNode, dropped: Set<SummaryNode>): SummaryNode | undefined {
  if (!node.children || node.children.length === 0) return dropped.has(node) ? undefined : node;
  const children = node.children
    .map((c) => prune(c, dropped))
    .filter((c): c is SummaryNode => c !== undefined);
  if (children.length === 0) return undefined;
  node.children = children;
  node.startLine = Math.min(...children.map((c) => c.startLine));
  node.endLine = Math.max(...children.map((c) => c.endLine));
  return node;
}
