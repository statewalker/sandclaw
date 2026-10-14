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

const withText = (c: Candidate, text: string) => ({ c, text });

describe("selectSections with coverage", () => {
  it("lifts a lower-ranked section that matches more query terms", () => {
    const a = withText(cand("a", 0.9), "company overview");
    const b = withText(cand("b", 0.8), "annual widget sales by region 2021");
    const c = withText(cand("c", 0.7), "glossary");
    const texts = new Map([a, b, c].map((x) => [x.c, x.text]));
    const out = selectSections([a.c, b.c, c.c], {
      topN: 1,
      coverage: {
        terms: ["widget sales", "region", "2021"],
        textOf: (x) => texts.get(x) ?? "",
      },
    });
    expect(keys(out)).toEqual(["b"]);
  });

  it("matches terms regardless of accents and case", () => {
    const a = withText(cand("a", 0.9), "plain text");
    const b = withText(cand("b", 0.8), "Café de la gare — Été");
    const texts = new Map([a, b].map((x) => [x.c, x.text]));
    const out = selectSections([a.c, b.c], {
      topN: 1,
      coverage: { terms: ["cafe", "ete"], textOf: (x) => texts.get(x) ?? "" },
    });
    expect(keys(out)).toEqual(["b"]);
  });

  it("keeps the search-score order when there are no terms", () => {
    const cs = [cand("a", 0.1), cand("b", 0.9), cand("c", 0.5)];
    const out = selectSections(cs, { topN: 3, coverage: { terms: [], textOf: () => "x" } });
    expect(keys(out)).toEqual(["b", "c", "a"]);
  });
});
