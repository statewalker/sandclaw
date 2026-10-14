import { expect } from "vitest";

/** Assert that `ranges`, in order, partition `first … last` (inclusive): no gap, no overlap. */
export function expectPartition(
  ranges: { startLine: number; endLine: number }[],
  first: number,
  last: number,
): void {
  expect(ranges.length).toBeGreaterThan(0);
  expect(ranges[0]?.startLine).toBe(first);
  expect(ranges.at(-1)?.endLine).toBe(last);
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (!r) throw new Error("missing range");
    expect(r.endLine).toBeGreaterThanOrEqual(r.startLine);
    if (i > 0) expect(r.startLine).toBe((ranges[i - 1]?.endLine ?? -2) + 1);
  }
}
