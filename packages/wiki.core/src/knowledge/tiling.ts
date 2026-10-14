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
