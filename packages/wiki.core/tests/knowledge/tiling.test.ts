import { describe, expect, it } from "vitest";
import { cutsToRanges, tileSummary } from "../../src/knowledge/tiling.js";
import { type SummaryNode, summaryLeaves } from "../../src/knowledge/types.js";
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

const leaf = (key: string, startLine: number, endLine: number): SummaryNode => ({
  key,
  title: key,
  summary: `sum ${key}`,
  startLine,
  endLine,
});
const node = (key: string, children: SummaryNode[]): SummaryNode => ({
  key,
  title: key,
  summary: "",
  startLine: Math.min(...children.map((c) => c.startLine)),
  endLine: Math.max(...children.map((c) => c.endLine)),
  children,
});

describe("tileSummary", () => {
  it("absorbs leading, inner and trailing gaps and trims overlaps", () => {
    // 12 lines; leaves leave line 0, overlap on 4, skip 7-8, stop at 9.
    const root = node("doc", [leaf("a", 1, 4), leaf("b", 4, 6), leaf("c", 9, 9)]);
    const { root: tiled, stats } = tileSummary(root, 12);
    const leaves = summaryLeaves(tiled);
    expect(leaves.map((l) => [l.key, l.startLine, l.endLine])).toEqual([
      ["a", 0, 4],
      ["b", 5, 8],
      ["c", 9, 11],
    ]);
    expectPartition(leaves, 0, 11);
    expect(stats).toEqual({ absorbedLines: 1 + 2 + 2, trimmedLines: 1, droppedLeaves: 0 });
  });

  it("clamps a leaf running past the text and drops a leaf entirely past it", () => {
    const root = node("doc", [leaf("a", 0, 3), leaf("b", 4, 50), leaf("gone", 60, 70)]);
    const { root: tiled, stats } = tileSummary(root, 8);
    const leaves = summaryLeaves(tiled);
    expect(leaves.map((l) => l.key)).toEqual(["a", "b"]);
    expectPartition(leaves, 0, 7);
    expect(stats.droppedLeaves).toBe(1);
  });

  it("drops a leaf fully covered by its predecessor", () => {
    const root = node("doc", [leaf("a", 0, 6), leaf("inside", 2, 4), leaf("b", 7, 9)]);
    const leaves = summaryLeaves(tileSummary(root, 10).root);
    expect(leaves.map((l) => l.key)).toEqual(["a", "b"]);
    expectPartition(leaves, 0, 9);
  });

  it("recomputes internal spans and removes an internal node left empty", () => {
    const root = node("doc", [
      node("ch1", [leaf("a", 2, 3), leaf("b", 5, 6)]),
      node("ch2", [leaf("gone", 40, 41)]),
      node("ch3", [leaf("c", 8, 9)]),
    ]);
    const { root: tiled } = tileSummary(root, 12);
    expect(tiled.children?.map((c) => [c.key, c.startLine, c.endLine])).toEqual([
      ["ch1", 0, 7],
      ["ch3", 8, 11],
    ]);
    expect([tiled.startLine, tiled.endLine]).toEqual([0, 11]);
    expectPartition(summaryLeaves(tiled), 0, 11);
  });

  it("tiles a single-leaf document (the root is the leaf)", () => {
    const { root: tiled } = tileSummary(leaf("only", 2, 3), 6);
    expect([tiled.startLine, tiled.endLine]).toEqual([0, 5]);
  });

  it("keeps extra root fields and does not mutate its input", () => {
    const root = { ...node("doc", [leaf("a", 1, 2)]), uri: "x.md", schemaVersion: 3 };
    const { root: tiled } = tileSummary(root, 5);
    expect(tiled.uri).toBe("x.md");
    expect(root.children?.[0]?.startLine).toBe(1);
  });
});
