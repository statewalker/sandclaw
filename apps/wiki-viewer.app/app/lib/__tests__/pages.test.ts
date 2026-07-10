import { describe, expect, it } from "vitest";
import {
  orderedCitationUris,
  parseCitationUri,
  promoteParagraphs,
  sectionToPdfPage,
  splitCitations,
} from "../pages";

describe("parseCitationUri", () => {
  it("splits file and anchor", () => {
    expect(parseCitationUri("Doc_One.pdf#introduction")).toEqual({
      file: "Doc_One.pdf",
      anchor: "introduction",
    });
  });

  it("handles a missing anchor", () => {
    expect(parseCitationUri("Foo.pdf")).toEqual({
      file: "Foo.pdf",
      anchor: "",
    });
  });

  it("trims surrounding whitespace (folded YAML scalars)", () => {
    expect(parseCitationUri("  Foo.pdf#a  ")).toEqual({
      file: "Foo.pdf",
      anchor: "a",
    });
  });

  it("keeps only the first '#' as the separator", () => {
    expect(parseCitationUri("Foo.pdf#a#b")).toEqual({
      file: "Foo.pdf",
      anchor: "a#b",
    });
  });
});

describe("splitCitations", () => {
  it("interleaves text and citation tokens", () => {
    const segments = splitCitations(
      "The doc says X [[A.pdf#one]]. See also [[B.pdf#two]].",
    );
    expect(segments).toEqual([
      { type: "text", value: "The doc says X " },
      { type: "cite", value: "A.pdf#one" },
      { type: "text", value: ". See also " },
      { type: "cite", value: "B.pdf#two" },
      { type: "text", value: "." },
    ]);
  });

  it("returns a single text segment when there are no citations", () => {
    expect(splitCitations("plain prose")).toEqual([
      { type: "text", value: "plain prose" },
    ]);
  });

  it("handles back-to-back citations", () => {
    expect(splitCitations("[[A#x]][[B#y]]")).toEqual([
      { type: "cite", value: "A#x" },
      { type: "cite", value: "B#y" },
    ]);
  });
});

describe("orderedCitationUris", () => {
  it("orders by first appearance and de-duplicates", () => {
    const text = "X [[A#1]] Y [[B#1]] Z [[A#1]] again [[A#2]].";
    expect(orderedCitationUris(text)).toEqual(["A#1", "B#1", "A#2"]);
  });

  it("appends extras not present in the prose, preserving prose order first", () => {
    const text = "only [[A#1]] here";
    expect(orderedCitationUris(text, ["A#1", "C#9", "B#3"])).toEqual([
      "A#1",
      "C#9",
      "B#3",
    ]);
  });

  it("returns an empty list for prose with no citations and no extras", () => {
    expect(orderedCitationUris("plain prose")).toEqual([]);
  });
});

describe("promoteParagraphs", () => {
  it("promotes single newlines between prose lines to paragraph breaks", () => {
    expect(promoteParagraphs("first line\nsecond line")).toBe(
      "first line\n\nsecond line",
    );
  });

  it("collapses runs of blank lines to a single paragraph break", () => {
    expect(promoteParagraphs("a\n\n\nb")).toBe("a\n\nb");
  });

  it("keeps a GFM table block intact (rows stay single-newline separated)", () => {
    const table = "| Name | Value |\n| --- | --- |\n| a | 1 |\n| b | 2 |";
    expect(promoteParagraphs(table)).toBe(table);
  });

  it("isolates a table from surrounding prose with paragraph breaks", () => {
    const input =
      "Intro line\n| H1 | H2 |\n| --- | --- |\n| x | y |\nOutro line";
    expect(promoteParagraphs(input)).toBe(
      "Intro line\n\n| H1 | H2 |\n| --- | --- |\n| x | y |\n\nOutro line",
    );
  });

  it("recognises tables without outer pipes and with alignment colons", () => {
    const table = "Name | Value\n:--- | ---:\na | 1";
    expect(promoteParagraphs(table)).toBe(table);
  });

  it("does not treat a `---` horizontal rule as a table delimiter", () => {
    expect(promoteParagraphs("above\n---\nbelow")).toBe(
      "above\n\n---\n\nbelow",
    );
  });
});

describe("sectionToPdfPage", () => {
  // Mirrors a real raw.txt: `## Page N` markers at line indices
  // 0, 26, 48, 61, 105 (0-based).
  const raw = (() => {
    const lines = new Array(200).fill("body text");
    lines[0] = "## Page 1";
    lines[26] = "## Page 2";
    lines[48] = "## Page 3";
    lines[61] = "## Page 4";
    lines[105] = "## Page 5";
    return lines.join("\n");
  })();

  it("maps the first section (startLine 0) to page 1", () => {
    expect(sectionToPdfPage(raw, 0)).toBe(1);
  });

  it("maps a line inside page 2 to page 2", () => {
    expect(sectionToPdfPage(raw, 40)).toBe(2);
  });

  it("counts a marker exactly at startLine", () => {
    expect(sectionToPdfPage(raw, 61)).toBe(4);
  });

  it("maps a deep line to the last preceding marker", () => {
    expect(sectionToPdfPage(raw, 150)).toBe(5);
  });

  it("defaults to page 1 when there are no markers before the line", () => {
    expect(sectionToPdfPage("no markers here\nsecond line", 1)).toBe(1);
  });
});
