import { describe, expect, it } from "vitest";
import type { Candidate } from "../../src/query/fsm/query-context.js";
import { selectSections } from "../../src/query/fsm/select.js";

const cand = (key: string, searchScore: number, score = 1): Candidate => ({
  section: { uri: "doc.pdf", sectionKey: key, title: key, summary: "" },
  score,
  searchScore,
});
const keys = (cs: Candidate[]) => cs.map((c) => c.section.sectionKey);

describe("selectSections", () => {
  it("keeps the top N single-front-end sections by search score", () => {
    const cs = [cand("a", 0.1), cand("b", 0.9), cand("c", 0.5)];
    expect(keys(selectSections(cs, { topN: 2 }))).toEqual(["b", "c"]);
  });

  it("keeps trusted sections on top of the cut, not inside it", () => {
    const cs = [cand("t", 0.01, 2), cand("a", 0.1), cand("b", 0.9)];
    expect(keys(selectSections(cs, { topN: 1 }))).toEqual(["t", "b"]);
  });

  it("returns every candidate when there are fewer than N", () => {
    const cs = [cand("a", 0.1), cand("b", 0.2)];
    expect(keys(selectSections(cs, { topN: 20 }))).toEqual(["b", "a"]);
  });
});

describe("selectSections with picks", () => {
  const cs = [cand("a", 0.9), cand("b", 0.8), cand("c", 0.7), cand("d", 0.6)];

  it("puts picked sections first, then fills in search order", () => {
    expect(keys(selectSections(cs, { topN: 3, picks: [3, 1] }))).toEqual(["d", "b", "a"]);
  });

  it("ignores out-of-range, duplicate and fractional picks", () => {
    expect(keys(selectSections(cs, { topN: 2, picks: [9, -1, 2, 2, 1.5] }))).toEqual(["c", "a"]);
  });

  it("keeps the search order when there are no picks", () => {
    expect(keys(selectSections(cs, { topN: 2, picks: [] }))).toEqual(["a", "b"]);
  });

  it("keeps trusted sections on top of picks", () => {
    const withTrusted = [cand("t", 0.1, 2), ...cs];
    expect(keys(selectSections(withTrusted, { topN: 1, picks: [2] }))).toEqual(["t", "c"]);
  });
});
