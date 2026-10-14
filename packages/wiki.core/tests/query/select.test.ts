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
