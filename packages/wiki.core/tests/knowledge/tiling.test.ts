import { describe, expect, it } from "vitest";
import { cutsToRanges } from "../../src/knowledge/tiling.js";
import { expectPartition } from "../util/partition.js";

const cut = (startLine: number, title = `T${startLine}`) => ({ startLine, title });

describe("cutsToRanges", () => {
  it("turns ordered cuts into contiguous ranges ending at the block end", () => {
    const placed = cutsToRanges([cut(10), cut(14), cut(17)], 10, 20);
    expect(placed.map((p) => [p.startLine, p.endLine])).toEqual([
      [10, 13],
      [14, 16],
      [17, 20],
    ]);
    expect(placed.map((p) => p.title)).toEqual(["T10", "T14", "T17"]);
  });

  it("sorts unsorted cuts and keeps each cut with its own payload", () => {
    const placed = cutsToRanges([cut(17, "c"), cut(10, "a"), cut(14, "b")], 10, 20);
    expect(placed.map((p) => p.title)).toEqual(["a", "b", "c"]);
    expectPartition(placed, 10, 20);
  });

  it("clamps cuts outside the block into it", () => {
    // A model that numbers lines from 0 in a later block, and one cut past the end.
    const placed = cutsToRanges([cut(0, "low"), cut(15, "mid"), cut(99, "high")], 10, 20);
    expect(placed.map((p) => [p.title, p.startLine, p.endLine])).toEqual([
      ["low", 10, 14],
      ["mid", 15, 19],
      ["high", 20, 20],
    ]);
  });

  it("keeps the first of two sections with the same start line", () => {
    const placed = cutsToRanges([cut(10, "a"), cut(12, "b"), cut(12, "dup")], 10, 15);
    expect(placed.map((p) => p.title)).toEqual(["a", "b"]);
    expectPartition(placed, 10, 15);
  });

  it("starts the first section at the block start even when the first cut is later", () => {
    const placed = cutsToRanges([cut(13), cut(16)], 10, 20);
    expect(placed[0]?.startLine).toBe(10);
    expectPartition(placed, 10, 20);
  });

  it("returns no ranges for no cuts", () => {
    expect(cutsToRanges([], 10, 20)).toEqual([]);
  });

  it("ignores an endLine the model may still send", () => {
    const placed = cutsToRanges(
      [
        { startLine: 10, endLine: 99 },
        { startLine: 12, endLine: 11 },
      ],
      10,
      15,
    );
    expect(placed.map((p) => [p.startLine, p.endLine])).toEqual([
      [10, 11],
      [12, 15],
    ]);
  });
});
