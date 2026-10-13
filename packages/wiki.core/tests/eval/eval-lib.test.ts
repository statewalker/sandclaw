import { describe, expect, it } from "vitest";
import { findQuoteLines, findQuoteTokenLines, linePages, pageRecall } from "../../eval/lib.js";

const RAW = [
  "## Page 1", // 0
  "", // 1
  "Cover of the report", // 2
  "", // 3
  "## Page 2", // 4
  "", // 5
  "The sale of Acme Widgets was completed", // 6
  "on December 15th. Ratio of 1.5x", // 7
  "## Page 3", // 8
  "Annex", // 9
].join("\n");

describe("linePages", () => {
  it("maps a line range to the pages it spans", () => {
    expect(linePages(RAW, 2, 3)).toEqual([1]);
    expect(linePages(RAW, 6, 9)).toEqual([2, 3]);
  });

  it("returns no pages for text without page markers (workbooks)", () => {
    expect(linePages("a\nb\nc", 0, 2)).toEqual([]);
  });
});

describe("findQuoteLines", () => {
  it("locates a quote across line breaks, ignoring whitespace and case", () => {
    expect(findQuoteLines(RAW, "completed on  DECEMBER 15th")).toEqual({ start: 6, end: 7 });
  });

  it("matches typographic quotes against straight ones", () => {
    expect(findQuoteLines("x\nthe ‘A’ rating\n", "the 'A' rating")).toEqual({ start: 1, end: 1 });
  });

  it("returns undefined for an absent quote", () => {
    expect(findQuoteLines(RAW, "not in the text")).toBeUndefined();
  });
});

describe("pageRecall", () => {
  const gold = [
    { document: "a.pdf", pages: [2, 3] },
    { document: "b.pdf", pages: [5] },
  ];

  it("counts gold (document, page) pairs hit by the retrieved pages", () => {
    const got = [{ document: "a.pdf", pages: [3, 4] }];
    expect(pageRecall(gold, got)).toEqual({ pages: 1 / 3, documents: 1 / 2 });
  });

  it("is undefined when the gold set has no pages (negative items)", () => {
    expect(pageRecall([], [{ document: "a.pdf", pages: [1] }])).toBeUndefined();
  });

  it("scores a workbook gold item at document level only", () => {
    const wb = [{ document: "w.xlsx", pages: [] }];
    expect(pageRecall(wb, [{ document: "w.xlsx", pages: [] }])).toEqual({
      pages: 1,
      documents: 1,
    });
  });
});

describe("findQuoteTokenLines", () => {
  const TABLE = [
    "## Page 1",
    "Mean score - Members",
    "## Page 2",
    "Mean score",
    "Members",
    "header",
    "42.0%",
  ].join("\n");

  it("finds the lines holding every token of a quote whose cells are reordered", () => {
    expect(findQuoteTokenLines(TABLE, "Mean score - Members 42.0%", [2])).toEqual([3, 4, 6]);
  });

  it("returns undefined when a token is missing from the cited pages", () => {
    expect(findQuoteTokenLines(TABLE, "Mean score - Members 42.0%", [1])).toBeUndefined();
  });
});
